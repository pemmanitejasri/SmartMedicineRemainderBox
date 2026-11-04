import {
  connectArduino,
  sendToArduino,
  getArduinoStatus
} from './serial.js';

async function testArduino() {
  try {
    console.log('Connecting to Arduino...');

    await connectArduino();

    console.log('Connection status:', getArduinoStatus());

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Sending PING...');

    await sendToArduino('PING');

  } catch (error) {
    console.error('Connection failed:', error.message);
  }
}

testArduino();