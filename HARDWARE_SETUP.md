# Smart Medicine Reminder Box — Arduino connection

## How this project connects

The React application uses the browser's **Web Serial API** directly. The Node backend on port 5000 is not the USB serial driver and does not need to open the Arduino COM port. Keep the backend running only for the existing HTTP/SSE features; connect the Nano from the web application's **Medicine Box Hardware** panel.

## Hardware pins used by the firmware

- Arduino Nano + DS3231: SDA → A4, SCL → A5, VCC → 5V, GND → GND.
- LED → D2 (use a suitable current-limiting resistor).
- Buzzer → D9 (use a suitable driver if the buzzer current exceeds a GPIO pin's rating).
- Push button → D6 and GND. Firmware uses `INPUT_PULLUP`, so pressed = LOW.

## Upload and connect

1. Install the **RTClib** library by Adafruit in Arduino IDE (Library Manager).
2. Select the Arduino Nano board and the correct processor/bootloader option for your Nano, then select its COM port.
3. Close Arduino IDE Serial Monitor/Serial Plotter before connecting from the browser; only one program can own the serial port at a time.
4. Open `arduino/SmartMedicineBox.ino`, compile, and upload it.
5. Run the existing frontend with `npm install` (first time) and `npm run dev` from `frontend/`.
6. Open the local Vite URL in desktop Chrome or Edge. Web Serial requires a secure context; localhost qualifies. Android Chrome does not provide the same Web Serial workflow.
7. Sign in, open the hardware panel, click **Connect Arduino**, choose the Nano's COM port, and allow access.
8. Wait for the status to show Connected. The app sends PING, synchronizes the DS3231 clock, then sends the saved medicine reminders. Use **Test Alarm** to verify LED/buzzer and **Sync Reminders** after changing existing schedules.
9. Add a medicine. If the Nano is connected, its reminder is sent immediately; otherwise connect later and use **Sync Reminders**.

## Protocol checks fixed

The frontend waits for `ACK,PING,...`, while the earlier firmware replied only `PONG`; that mismatch caused the connection handshake to time out. The firmware now replies `ACK,PING,PONG`. The hardware-test acknowledgement is also aligned with the frontend. The firmware supports 16 reminders and IDs up to 36 characters.

## Important limitations

- The browser tab and computer must remain available to manage the connection; unplugging the USB cable disconnects the browser serial session.
- Reminder schedules are held in Nano RAM and must be synchronized again after the Nano resets or loses power. The web app re-sends saved reminders when you connect.
- Test the device with a harmless test schedule before relying on it. This prototype is a reminder aid, not a substitute for prescribed medication instructions or professional medical advice.
