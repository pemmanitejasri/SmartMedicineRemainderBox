// backend/serial.js

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

const PORT_NAME = 'COM5';
const BAUD_RATE = 9600;

const arduino = new SerialPort({
  path: PORT_NAME,
  baudRate: BAUD_RATE,
  autoOpen: false
});

const parser = arduino.pipe(
  new ReadlineParser({ delimiter: '\n' })
);

let isConnected = false;

export function connectArduino() {
  return new Promise((resolve, reject) => {
    if (arduino.isOpen) {
      isConnected = true;
      return resolve(true);
    }

    arduino.open((error) => {
      if (error) {
        isConnected = false;
        return reject(error);
      }

      isConnected = true;
      console.log('Arduino connected on', PORT_NAME);

      resolve(true);
    });
  });
}

export function getArduinoStatus() {
  return {
    connected: isConnected,
    port: PORT_NAME
  };
}

export function sendToArduino(command) {
  return new Promise((resolve, reject) => {
    if (!arduino.isOpen) {
      return reject(new Error('Arduino is not connected'));
    }

    arduino.write(command + '\n', (error) => {
      if (error) return reject(error);

      arduino.drain((drainError) => {
        if (drainError) return reject(drainError);

        console.log('Sent to Arduino:', command);
        resolve(true);
      });
    });
  });
}

parser.on('data', (data) => {
  const message = data.trim();

  if (message) {
    console.log('Arduino response:', message);
  }
});

arduino.on('error', (error) => {
  isConnected = false;
  console.error('Arduino serial error:', error.message);
});

arduino.on('close', () => {
  isConnected = false;
  console.log('Arduino disconnected');
});