const maxDataPoints = 20;

// Elements
const voltageValueEl = document.getElementById('voltageValue');
const adcValueEl = document.getElementById('adcValue');
const gaugeFill = document.getElementById('gaugeFill');
const connectionStatus = document.getElementById('connectionStatus');

// Initialize Chart.js graph
const ctx = document.getElementById('voltageChart').getContext('2d');
const voltageChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'Voltage (V)',
      data: [],
      borderColor: '#38bdf8',
      backgroundColor: 'rgba(56, 189, 248, 0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 3
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: '#334155' },
        ticks: { color: '#94a3b8' }
      },
      y: {
        min: 0,
        max: 3.3,
        grid: { color: '#334155' },
        ticks: { color: '#94a3b8' }
      }
    },
    plugins: {
      legend: { labels: { color: '#f8fafc' } }
    }
  }
});

// Update Gauge Arc (0V - 3.3V)
function updateGauge(voltage) {
  const maxVoltage = 3.3;
  const maxOffset = 126;
  const percentage = Math.min(Math.max(voltage / maxVoltage, 0), 1);
  const offset = maxOffset * (1 - percentage);
  
  gaugeFill.style.strokeDashoffset = offset;

  if (voltage > 3.0) {
    gaugeFill.style.stroke = '#ef4444'; 
  } else if (voltage > 2.5) {
    gaugeFill.style.stroke = '#f59e0b'; 
  } else {
    gaugeFill.style.stroke = '#38bdf8'; 
  }
}

// Push data into UI and Chart
function pushVoltageData(voltage, adc, timeLabel) {
  voltageValueEl.textContent = voltage.toFixed(2);
  adcValueEl.textContent = adc;
  updateGauge(voltage);

  const timestamp = timeLabel || new Date().toLocaleTimeString();
  
  voltageChart.data.labels.push(timestamp);
  voltageChart.data.datasets[0].data.push(voltage);

  if (voltageChart.data.labels.length > maxDataPoints) {
    voltageChart.data.labels.shift();
    voltageChart.data.datasets[0].data.shift();
  }

  voltageChart.update();
}

// 1. Load historical database records when the page loads
fetch('/api/readings')
  .then(response => response.json())
  .then(data => {
    if (data.length > 0) {
      data.forEach(item => {
        const timeOnly = item.timestamp.split(' ')[1]; // Extract HH:MM:SS
        pushVoltageData(item.voltage, item.adc, timeOnly);
      });
    }
  })
  .catch(err => console.error('Could not load history from database:', err));

// 2. --- MQTT Connection Setup for Real-Time Streaming ---
const brokerUrl = 'wss://broker.hivemq.com:8884/mqtt';
const topicVoltage = 'esp32/potentiometer/voltage';
const topicAdc = 'esp32/potentiometer/adc';

console.log('Connecting to MQTT broker...');
const client = mqtt.connect(brokerUrl);

client.on('connect', () => {
  console.log('Connected to HiveMQ broker successfully!');
  connectionStatus.textContent = 'Live (Connected)';
  connectionStatus.style.backgroundColor = '#16a34a'; 

  client.subscribe(topicVoltage);
  client.subscribe(topicAdc);
});

client.on('error', (err) => {
  console.error('MQTT Connection Error: ', err);
  connectionStatus.textContent = 'Connection Error';
  connectionStatus.style.backgroundColor = '#dc2626'; 
});

let currentVoltage = 0.0;
let currentAdc = 0;

client.on('message', (topic, payload) => {
  const message = payload.toString();
  
  if (topic === topicVoltage) {
    currentVoltage = parseFloat(message);
    pushVoltageData(currentVoltage, currentAdc);
  } else if (topic === topicAdc) {
    currentAdc = parseInt(message);
  }
});