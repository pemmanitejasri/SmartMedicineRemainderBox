/*
  ========================================================================
  SmartMed — Smart Medicine Reminder Box
  Microcontroller Firmware for Arduino Nano + DS3231 RTC
  ========================================================================
  Hardware Configuration:
    - Arduino Nano (ATmega328P)
    - DS3231 RTC module (I2C: SDA -> A4, SCL -> A5, VCC -> 5V, GND -> GND)
    - LED connected to digital pin D2
    - Buzzer connected to digital pin D9
    - Push button connected to digital pin D6 (INPUT_PULLUP: pressed = LOW)
    - Serial communication at 9600 baud

  Key Features & Architecture:
    1. DS3231 Real-Time Clock maintenance (does NOT reset on upload or reboot).
    2. Fallback software clock: if RTC loses battery or I2C communication,
       Arduino maintains clock via millis() so alarms still trigger!
    3. Multi-reminder storage: stores up to 16 distinct daily reminders.
    4. Flexible command parser: accepts SET,HH:MM and SET,HH:MM,id and SET,id,HH:MM.
    5. Non-blocking alarm: LED on D2 lights up, Buzzer on D9 sounds pulsing tone.
    6. Real alarm persists until physical push button on D6 is pressed (with 10-min unattended safety limit).
    7. Push button on D6 debounced: stops alarm and transmits MEDICINE_TAKEN event.
    8. Safe Hardware Test command: TEST immediately returns ACK,TEST,HARDWARE_OK
       and runs LED & Buzzer for 1.5 seconds.
    9. Real-time Clock synchronization: SYNC_TIME adjusts DS3231 RTC accurately.
   10. Periodic broadcast: transmits live RTC time every 2 seconds for real-time web sync.
  ========================================================================
*/

#include <Wire.h>
#include "RTClib.h"

// Hardware Pin Definitions
const int LED_PIN     = 2;
const int BUZZER_PIN  = 9;
const int BUTTON_PIN  = 6;

// RTC Object
RTC_DS3231 rtc;
bool rtcFound = false;

// Fallback internal software clock variables (in case RTC hardware is delayed or lost)
unsigned long softwareTimeBase = 0; // Unix timestamp
unsigned long softwareMillisBase = 0;

// Reminder Storage
#define MAX_REMINDERS 16
#define ID_MAX_LEN    36

struct Reminder {
  char id[ID_MAX_LEN + 1];
  uint8_t hour;     // 0 - 23 (24-hour format)
  uint8_t minute;   // 0 - 59
  bool active;
  uint8_t lastTriggeredDay;
  uint8_t lastTriggeredMinute;
};

Reminder reminders[MAX_REMINDERS];
int reminderCount = 0;

// Alarm State Variables
bool alarmActive = false;
int activeReminderIndex = -1;
unsigned long lastBuzzerToggle = 0;
bool buzzerToneState = false;
unsigned long alarmStartTime = 0;
const unsigned long ALARM_TIMEOUT_MS = 600000UL; // 10-minute auto shutoff safety limit if unattended

// Hardware Test Mode Variables
bool hardwareTestActive = false;
unsigned long hardwareTestStartTime = 0;
const unsigned long HARDWARE_TEST_DURATION_MS = 1500; // 1.5 seconds test

// Button Debounce State
int lastButtonReading = HIGH;
int stableButtonState = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long DEBOUNCE_DELAY_MS = 50;

// Serial Communication Buffer
char rxBuffer[100];
int rxIndex = 0;

// Timers
unsigned long lastRtcCheckTime = 0;
const unsigned long RTC_CHECK_INTERVAL_MS = 1000; // Check every second

unsigned long lastTimeBroadcast = 0;
const unsigned long TIME_BROADCAST_INTERVAL_MS = 2000; // Broadcast time every 2 seconds

// Forward Declarations
void processSerialCommand(char* cmd);
void handleButtonPress();
void stopAlarm();
void checkScheduledReminders(uint8_t currentHour, uint8_t currentMinute, uint8_t currentDay);
int findReminderIndex(const char* id);
DateTime getSafeCurrentTime();
void sendCurrentTime();

void setup() {
  Serial.begin(9600);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  pinMode(BUTTON_PIN, INPUT_PULLUP);

  Wire.begin();

  // Retry RTC initialization up to 3 times
  for (int retry = 0; retry < 3; retry++) {
    if (rtc.begin()) {
      rtcFound = true;
      break;
    }
    delay(50);
  }

  if (!rtcFound) {
    Serial.println(F("WARN,RTC_NOT_FOUND,USING_SOFTWARE_CLOCK"));
    softwareTimeBase = 1792843200UL; // 2026-10-24 12:00:00 default
    softwareMillisBase = millis();
  } else {
    // Do NOT unconditionally reset RTC on boot!
    if (rtc.lostPower()) {
      Serial.println(F("WARN,RTC_LOST_POWER"));
    }
  }

  // Clear reminder array
  for (int i = 0; i < MAX_REMINDERS; i++) {
    reminders[i].id[0] = '\0';
    reminders[i].hour = 0;
    reminders[i].minute = 0;
    reminders[i].active = false;
    reminders[i].lastTriggeredDay = 255;
    reminders[i].lastTriggeredMinute = 255;
  }

  // Startup chime (two pleasant chirps)
  tone(BUZZER_PIN, 1200, 100);
  delay(120);
  tone(BUZZER_PIN, 1600, 120);

  // Ready beacon
  Serial.println(F("STATUS,READY,SMARTMED_NANO_BOX"));
  sendCurrentTime();
}

void loop() {
  unsigned long currentMillis = millis();

  // 1. Non-blocking Serial Reader
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (rxIndex > 0) {
        rxBuffer[rxIndex] = '\0';
        processSerialCommand(rxBuffer);
        rxIndex = 0;
      }
    } else if (rxIndex < (int)sizeof(rxBuffer) - 1) {
      rxBuffer[rxIndex++] = c;
    }
  }

  // 2. Hardware Test Mode Execution (Safe 1.5s LED + Buzzer test)
  if (hardwareTestActive) {
    digitalWrite(LED_PIN, HIGH);
    tone(BUZZER_PIN, 1500);

    if (currentMillis - hardwareTestStartTime >= HARDWARE_TEST_DURATION_MS) {
      hardwareTestActive = false;
      digitalWrite(LED_PIN, LOW);
      noTone(BUZZER_PIN);
      digitalWrite(BUZZER_PIN, LOW);
    }
    return; // Don't check alarm during diagnostic test
  }

  // 3. RTC Time & Alarm Trigger Check (every 1 second)
  if (currentMillis - lastRtcCheckTime >= RTC_CHECK_INTERVAL_MS) {
    lastRtcCheckTime = currentMillis;
    DateTime now = getSafeCurrentTime();
    if (!alarmActive) {
      checkScheduledReminders(now.hour(), now.minute(), now.day());
    }
  }

  // 4. Periodic Clock Broadcast (every 2 seconds) so website has live RTC time
  if (currentMillis - lastTimeBroadcast >= TIME_BROADCAST_INTERVAL_MS) {
    lastTimeBroadcast = currentMillis;
    if (!alarmActive && !hardwareTestActive) {
      sendCurrentTime();
    }
  }

  // 5. Alarm Tone & LED Pulsing (Non-blocking)
  // Keeps sounding until physical push button on D6 is pressed
  if (alarmActive) {
    digitalWrite(LED_PIN, HIGH);

    if (currentMillis - lastBuzzerToggle >= 400) {
      lastBuzzerToggle = currentMillis;
      buzzerToneState = !buzzerToneState;
      if (buzzerToneState) {
        tone(BUZZER_PIN, 2000);
      } else {
        noTone(BUZZER_PIN);
        digitalWrite(BUZZER_PIN, LOW);
      }
    }

    // Safety auto-shutoff after ALARM_TIMEOUT_MS (10 mins unattended)
    if (currentMillis - alarmStartTime >= ALARM_TIMEOUT_MS) {
      Serial.print(F("ALARM_TIMEOUT,"));
      if (activeReminderIndex >= 0) {
        Serial.println(reminders[activeReminderIndex].id);
      } else {
        Serial.println(F("UNKNOWN"));
      }
      stopAlarm();
    }
  }

  // 6. Physical Push Button Handling with 50ms Debounce on D6 (INPUT_PULLUP)
  int reading = digitalRead(BUTTON_PIN);
  if (reading != lastButtonReading) {
    lastDebounceTime = currentMillis;
  }

  if ((currentMillis - lastDebounceTime) > DEBOUNCE_DELAY_MS) {
    if (reading != stableButtonState) {
      stableButtonState = reading;
      // Button pressed (active LOW on D6 with INPUT_PULLUP)
      if (stableButtonState == LOW) {
        handleButtonPress();
      }
    }
  }

  lastButtonReading = reading;
}

// Safely get current time, using DS3231 RTC or fallback software clock
DateTime getSafeCurrentTime() {
  if (rtcFound) {
    return rtc.now();
  }
  // Software clock fallback
  unsigned long elapsedSecs = (millis() - softwareMillisBase) / 1000UL;
  return DateTime(softwareTimeBase + elapsedSecs);
}

// Check scheduled reminders against current time
void checkScheduledReminders(uint8_t currentHour, uint8_t currentMinute, uint8_t currentDay) {
  for (int i = 0; i < MAX_REMINDERS; i++) {
    if (reminders[i].active) {
      if (reminders[i].hour == currentHour && reminders[i].minute == currentMinute) {
        // Prevent repeated triggers during the same scheduled minute
        if (reminders[i].lastTriggeredDay != currentDay ||
            reminders[i].lastTriggeredMinute != currentMinute) {
          
          reminders[i].lastTriggeredDay = currentDay;
          reminders[i].lastTriggeredMinute = currentMinute;

          alarmActive = true;
          activeReminderIndex = i;
          alarmStartTime = millis();
          lastBuzzerToggle = millis();
          buzzerToneState = true;

          // Turn on LED and sound buzzer
          digitalWrite(LED_PIN, HIGH);
          tone(BUZZER_PIN, 2000);

          char timeBuf[8];
          sprintf(timeBuf, "%02d:%02d", currentHour, currentMinute);
          Serial.print(F("ALARM_STARTED,"));
          Serial.print(reminders[i].id);
          Serial.print(F(","));
          Serial.println(timeBuf);
          break; // Ring for one dose at a time
        }
      }
    }
  }
}

// Stop the active alarm
void stopAlarm() {
  alarmActive = false;
  digitalWrite(LED_PIN, LOW);
  noTone(BUZZER_PIN);
  digitalWrite(BUZZER_PIN, LOW);
  buzzerToneState = false;
  activeReminderIndex = -1;
}

// Handle physical push button press
void handleButtonPress() {
  if (alarmActive && activeReminderIndex >= 0) {
    int index = activeReminderIndex;
    char medId[ID_MAX_LEN + 1];
    strncpy(medId, reminders[index].id, ID_MAX_LEN);
    medId[ID_MAX_LEN] = '\0';

    char timeBuf[8];
    sprintf(timeBuf, "%02d:%02d", reminders[index].hour, reminders[index].minute);

    // 1. Immediately turn off LED and Buzzer
    stopAlarm();

    // 2. Play distinct pleasant confirmation chirps
    tone(BUZZER_PIN, 2200, 120);
    delay(140);
    tone(BUZZER_PIN, 2800, 180);

    // 3. Emit MEDICINE_TAKEN event
    Serial.print(F("MEDICINE_TAKEN,"));
    Serial.print(medId);
    Serial.print(F(","));
    Serial.println(timeBuf);

    // Also emit JSON formatted line for seamless parser compatibility
    Serial.print(F("{\"event\":\"MEDICINE_TAKEN\",\"medicineId\":\""));
    Serial.print(medId);
    Serial.print(F("\",\"time\":\""));
    Serial.print(timeBuf);
    Serial.println(F("\",\"source\":\"physical_button\"}"));
  } else {
    // Button pressed when alarm is NOT sounding:
    // Do NOT generate a MEDICINE_TAKEN event
    Serial.println(F("BUTTON_CLICK,IDLE"));
  }
}

// Find reminder index by ID
int findReminderIndex(const char* id) {
  for (int i = 0; i < MAX_REMINDERS; i++) {
    if (reminders[i].active && strcmp(reminders[i].id, id) == 0) {
      return i;
    }
  }
  return -1;
}

// Print current confirmed time over serial
void sendCurrentTime() {
  DateTime now = getSafeCurrentTime();
  char buf[40];
  sprintf(buf, "TIME,%04d-%02d-%02d %02d:%02d:%02d",
          now.year(), now.month(), now.day(),
          now.hour(), now.minute(), now.second());
  Serial.println(buf);
}

// Parse and process incoming Serial commands
void processSerialCommand(char* cmd) {
  if (cmd == NULL) return;

  // Trim leading whitespace
  while (*cmd == ' ' || *cmd == '\t') cmd++;
  int len = strlen(cmd);
  // Trim trailing whitespace and carriage returns
  while (len > 0 && (cmd[len - 1] == ' ' || cmd[len - 1] == '\t' || cmd[len - 1] == '\r' || cmd[len - 1] == '\n')) {
    cmd[--len] = '\0';
  }
  if (len == 0) return;

  // 1. PING
  if (strncmp(cmd, "PING", 4) == 0) {
    Serial.println(F("PONG"));
    return;
  }

  // 2. TEST: Safe Hardware Diagnostic Test (Requirement #4 & #9)
  // Immediately return ACK,TEST,HARDWARE_OK so Web Serial does NOT time out!
  if (strncmp(cmd, "TEST", 4) == 0) {
    Serial.println(F("ACK,TEST,HARDWARE_OK"));
    hardwareTestActive = true;
    hardwareTestStartTime = millis();
    digitalWrite(LED_PIN, HIGH);
    tone(BUZZER_PIN, 1500);
    return;
  }

  // 3. STATUS
  if (strncmp(cmd, "STATUS", 6) == 0) {
    int activeCount = 0;
    for (int i = 0; i < MAX_REMINDERS; i++) {
      if (reminders[i].active) activeCount++;
    }
    Serial.print(F("STATUS,CONNECTED,REMINDERS:"));
    Serial.print(activeCount);
    Serial.print(F(",ALARM:"));
    Serial.println(alarmActive ? 1 : 0);
    return;
  }

  // 4. GET_TIME
  if (strncmp(cmd, "GET_TIME", 8) == 0) {
    sendCurrentTime();
    return;
  }

  // 5. SYNC_TIME or SET_TIME: Synchronize RTC to host local time (IST)
  if (strncmp(cmd, "SYNC_TIME,", 10) == 0 || strncmp(cmd, "SET_TIME,", 9) == 0) {
    char* param = (strncmp(cmd, "SYNC_TIME,", 10) == 0) ? (cmd + 10) : (cmd + 9);
    while (*param == ' ') param++;

    int y = 0, m = 0, d = 0, h = 0, mi = 0, s = 0;
    // Format 1: YYYY,MM,DD,HH,MM,SS
    if (sscanf(param, "%d,%d,%d,%d,%d,%d", &y, &m, &d, &h, &mi, &s) == 6) {
      if (rtcFound) {
        rtc.adjust(DateTime(y, m, d, h, mi, s));
      }
      softwareTimeBase = DateTime(y, m, d, h, mi, s).unixtime();
      softwareMillisBase = millis();

      char buf[36];
      sprintf(buf, "%04d-%02d-%02d %02d:%02d:%02d", y, m, d, h, mi, s);
      Serial.print(F("ACK,SYNC_TIME,"));
      Serial.println(buf);
      sendCurrentTime();
      return;
    }

    // Format 2: HH:MM:SS
    if (sscanf(param, "%d:%d:%d", &h, &mi, &s) == 3 || sscanf(param, "%d,%d,%d", &h, &mi, &s) == 3) {
      DateTime current = getSafeCurrentTime();
      y = current.year();
      m = current.month();
      d = current.day();
      if (y < 2020) y = 2026;

      if (rtcFound) {
        rtc.adjust(DateTime(y, m, d, h, mi, s));
      }
      softwareTimeBase = DateTime(y, m, d, h, mi, s).unixtime();
      softwareMillisBase = millis();

      char buf[36];
      sprintf(buf, "%04d-%02d-%02d %02d:%02d:%02d", y, m, d, h, mi, s);
      Serial.print(F("ACK,SYNC_TIME,"));
      Serial.println(buf);
      sendCurrentTime();
      return;
    }

    Serial.println(F("ERR,INVALID_TIME_FORMAT"));
    return;
  }

  // 6. CLEAR: clear stored reminders
  // Note: does NOT stop an active alarm
  if (strncmp(cmd, "CLEAR", 5) == 0) {
    for (int i = 0; i < MAX_REMINDERS; i++) {
      reminders[i].active = false;
      reminders[i].id[0] = '\0';
    }
    reminderCount = 0;
    Serial.println(F("ACK,CLEAR,ALL,0"));
    return;
  }

  // 7. DEL,id
  if (strncmp(cmd, "DEL,", 4) == 0) {
    const char* id = cmd + 4;
    int idx = findReminderIndex(id);
    if (idx >= 0) {
      reminders[idx].active = false;
      reminders[idx].id[0] = '\0';
      Serial.print(F("ACK,DEL,"));
      Serial.print(id);
      Serial.println(F(",DELETED"));
    } else {
      Serial.print(F("ACK,DEL,"));
      Serial.print(id);
      Serial.println(F(",NOT_FOUND"));
    }
    return;
  }

  // 8. LIST: list all stored reminders
  if (strncmp(cmd, "LIST", 4) == 0) {
    int count = 0;
    for (int i = 0; i < MAX_REMINDERS; i++) {
      if (reminders[i].active) {
        char buf[8];
        sprintf(buf, "%02d:%02d", reminders[i].hour, reminders[i].minute);
        Serial.print(F("REMINDER,"));
        Serial.print(reminders[i].id);
        Serial.print(F(","));
        Serial.println(buf);
        count++;
      }
    }
    Serial.print(F("ACK,LIST,"));
    Serial.println(count);
    return;
  }

  // 9. SET Command: accepts SET,HH:MM and SET,HH:MM,id and SET,id,HH:MM
  if (strncmp(cmd, "SET,", 4) == 0) {
    const char* params = cmd + 4;
    char idBuf[ID_MAX_LEN + 1];
    char timeBuf[12];
    idBuf[0] = '\0';
    timeBuf[0] = '\0';

    const char* commaPos = strchr(params, ',');
    if (commaPos != NULL) {
      char token1[ID_MAX_LEN + 1];
      char token2[ID_MAX_LEN + 1];

      int len1 = commaPos - params;
      if (len1 > ID_MAX_LEN) len1 = ID_MAX_LEN;
      strncpy(token1, params, len1);
      token1[len1] = '\0';

      strncpy(token2, commaPos + 1, ID_MAX_LEN);
      token2[ID_MAX_LEN] = '\0';

      // Trim spaces
      char* t1 = token1;
      while (*t1 == ' ') t1++;
      char* t2 = token2;
      while (*t2 == ' ') t2++;

      // Identify which token contains the colon (the HH:MM time)
      if (strchr(t1, ':') != NULL) {
        strncpy(timeBuf, t1, sizeof(timeBuf) - 1);
        strncpy(idBuf, t2, sizeof(idBuf) - 1);
      } else {
        strncpy(idBuf, t1, sizeof(idBuf) - 1);
        strncpy(timeBuf, t2, sizeof(timeBuf) - 1);
      }
    } else {
      // SET,HH:MM
      strncpy(timeBuf, params, sizeof(timeBuf) - 1);
      timeBuf[sizeof(timeBuf) - 1] = '\0';
      char* tb = timeBuf;
      while (*tb == ' ') tb++;
      if (tb != timeBuf) memmove(timeBuf, tb, strlen(tb) + 1);

      snprintf(idBuf, sizeof(idBuf), "rem_%s", timeBuf);
      char* colon = strchr(idBuf, ':');
      if (colon) *colon = '_';
    }

    timeBuf[sizeof(timeBuf) - 1] = '\0';
    idBuf[sizeof(idBuf) - 1] = '\0';

    int h = 0, m = 0;
    if (sscanf(timeBuf, "%d:%d", &h, &m) != 2 || h < 0 || h > 23 || m < 0 || m > 59) {
      Serial.println(F("ERR,INVALID_TIME_FORMAT"));
      return;
    }

    // Check if reminder with this ID already exists
    int existingIdx = findReminderIndex(idBuf);
    if (existingIdx >= 0) {
      reminders[existingIdx].hour = (uint8_t)h;
      reminders[existingIdx].minute = (uint8_t)m;
      reminders[existingIdx].active = true;
      reminders[existingIdx].lastTriggeredDay = 255;
      reminders[existingIdx].lastTriggeredMinute = 255;

      char ackTime[8];
      sprintf(ackTime, "%02d:%02d", h, m);
      Serial.print(F("ACK,SET,"));
      Serial.print(ackTime);
      Serial.print(F(","));
      Serial.println(idBuf);
      return;
    }

    // Find first empty slot
    int emptySlot = -1;
    for (int i = 0; i < MAX_REMINDERS; i++) {
      if (!reminders[i].active) {
        emptySlot = i;
        break;
      }
    }

    if (emptySlot >= 0) {
      strncpy(reminders[emptySlot].id, idBuf, ID_MAX_LEN);
      reminders[emptySlot].id[ID_MAX_LEN] = '\0';
      reminders[emptySlot].hour = (uint8_t)h;
      reminders[emptySlot].minute = (uint8_t)m;
      reminders[emptySlot].active = true;
      reminders[emptySlot].lastTriggeredDay = 255;
      reminders[emptySlot].lastTriggeredMinute = 255;

      char ackTime[8];
      sprintf(ackTime, "%02d:%02d", h, m);
      Serial.print(F("ACK,SET,"));
      Serial.print(ackTime);
      Serial.print(F(","));
      Serial.println(idBuf);
    } else {
      Serial.println(F("ERR,REMINDER_STORAGE_FULL"));
    }
    return;
  }

  // Unrecognized command
  Serial.print(F("ERR,UNKNOWN_COMMAND,"));
  Serial.println(cmd);
}
