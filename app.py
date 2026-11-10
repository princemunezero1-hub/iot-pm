import threading
from flask import Flask, jsonify, render_template

import paho.mqtt.client as mqtt
import sqlite3
from datetime import datetime

app = Flask(__name__, template_folder="templates", static_folder="static")


DB_FILE = "iot_data.db"
MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
TOPIC_VOLTAGE = "esp32/potentiometer/voltage"
TOPIC_ADC = "esp32/potentiometer/adc"

# Initialize SQLite Database
def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voltage REAL,
            adc INTEGER,
            timestamp TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()

@app.route("/")
def index():
    return render_template("index.html")

# Temporary storage for latest values
latest_data = {"voltage": 0.0, "adc": 0}

# MQTT Callbacks
def on_connect(client, userdata, flags, rc):
    print(f"Connected to MQTT Broker with result code {rc}")
    client.subscribe(TOPIC_VOLTAGE)
    client.subscribe(TOPIC_ADC)

def on_message(client, userdata, msg):
    global latest_data
    payload = msg.payload.decode()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    if msg.topic == TOPIC_VOLTAGE:
        latest_data["voltage"] = float(payload)
    elif msg.topic == TOPIC_ADC:
        latest_data["adc"] = int(payload)

    # Save to database when we get a voltage update
    if msg.topic == TOPIC_VOLTAGE:
        cursor.execute("INSERT INTO readings (voltage, adc, timestamp) VALUES (?, ?, ?)",
                       (latest_data["voltage"], latest_data["adc"], timestamp))
        conn.commit()
    
    conn.close()

# Run MQTT Client in a background thread
def run_mqtt():
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.loop_forever()

# API Endpoint to fetch historical data for graphs
@app.route('/api/readings', methods=['GET'])
def get_readings():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT voltage, adc, timestamp FROM readings ORDER BY id DESC LIMIT 50")
    rows = cursor.fetchall()
    conn.close()

    readings = [{"voltage": r[0], "adc": r[1], "timestamp": r[2]} for r in rows]
    return jsonify(readings[::-1]) # Return in chronological order

if __name__ == '__main__':
    # Start MQTT background thread
    mqtt_thread = threading.Thread(target=run_mqtt)
    mqtt_thread.daemon = True
    mqtt_thread.start()

    # Run Flask App
    app.run(host='0.0.0.0', port=5000, debug=False)