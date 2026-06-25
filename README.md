# Healthy Food Delivery App

This project is a cross-platform mobile application for ordering healthy food, integrated with an AI-powered dietary consultant. The system leverages Natural Language Processing (NLP) to parse complex user queries, maintain conversational context, and execute dynamically generated SQL queries against a relational database.

## System Features

### Mobile Client (Frontend)
*   **Menu and Cart Management:** Browse dietary plans, filter individual dishes, manage the shopping cart, apply bonus points, and process orders.
*   **Native Speech-to-Text (STT):** Device-level voice recognition integration for hands-free searching and interacting with the AI assistant.
*   **Conversational AI Interface:** A dedicated chat screen where the AI dietary consultant interacts with the user. The UI includes dynamic prompt chips, message history, and interactive dish cards rendered directly within the chat timeline.
*   **Nested Navigation:** Seamless routing from chat recommendations to detailed product screens and back.

### Server-Side and AI Processing (Backend)
*   **Smart Search Parsing:** Converts natural language queries (e.g., "high protein dinner under 400 calories without tomatoes") into strict JSON structures using the Google Gemini LLM.
*   **Dynamic SQL Generation:** Maps the parsed JSON parameters to parameterized SQL queries with multi-table `JOIN` statements and `EXISTS` subqueries to filter by ingredients, calories, macros, and categories.
*   **State-less Context Memory:** The chat history and previously applied search filters are maintained on the client side and passed to the backend per request, allowing the AI to handle refining queries (e.g., "now make it cheaper") without storing session states on the server.
*   **Progressive Filter Relaxation:** If an overly strict query yields zero results, the backend systematically relaxes the constraints (removing category, then exclusions, then calorie limits) to recommend the closest available alternatives instead of returning an empty response.
*   **Linguistic Stemming:** Utilizes the Snowball stemming algorithm to process Russian morphology, ensuring that different word forms (e.g., singular/plural) accurately match database entries.
*   **Two-Layer Caching:** Implements LRU (Least Recently Used) caches for both Gemini API responses and SQL query results to reduce API costs, mitigate rate limits, and decrease response latency.
*   **Security and Fallbacks:** Includes input sanitization to prevent prompt injection and a pure-text search fallback mechanism in case the LLM API becomes unavailable or times out.

---

## Technology Stack and Dependencies

### Frontend (React Native / Expo)
*   `expo` (SDK 54): Core framework.
*   `react-native`: UI components.
*   `@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`: Application routing and navigation.
*   `zustand`: Global state management (Auth and Cart).
*   `axios`: HTTP client for backend communication.
*   `@react-native-voice/voice`: Native speech recognition module.
*   `expo-av`: Audio and microphone permission handling.
*   `@react-native-async-storage/async-storage`: Local storage for session persistence.
*   `expo-dev-client`: Required for compiling native modules not supported by standard Expo Go.

### Backend (Node.js / Express)
*   `express`: Web server framework.
*   `mysql2`: Promise-based MySQL driver for database interactions.
*   `@google/generative-ai`: Official SDK for Google Gemini LLM integration.
*   `node-snowball`: Multilingual stemming library.
*   `lru-cache`: In-memory caching utility.
*   `dotenv`: Environment variable management.

---

## Prerequisites

*   **Node.js**: v18.0.0 or higher.
*   **MySQL**: Version 8.0 or higher.
*   **Java Development Kit (JDK)**: Version 17 (Required for local Android compilation).
*   **Android SDK**: Configured via Android Studio with `ANDROID_HOME` environment variable set.
*   **Google Gemini API Key**: Acquired from Google AI Studio.

*Note:* A system-wide VPN connection on the backend host machine may be necessary if the Google Gemini API is geo-blocked in your region.

---

## Installation and Setup

### 1. Backend Setup

Navigate to the backend directory:
```bash
cd backend
```

Install the required dependencies:
```bash
npm install
```

Create a `.env` file in the root of the `backend` directory and define the following variables:
```env
PORT=3000
DB_HOST=localhost
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=your_database_name
GEMINI_API_KEY=your_gemini_api_key
```

Start the backend server:
```bash
npm run dev
```

### 2. Frontend Setup

Navigate to the mobile application directory:
```bash
cd healthy-food-delivery-mobile-app
```

Install the frontend dependencies:
```bash
npm install
```

**Important Architecture Note:** 
Because this project utilizes `@react-native-voice/voice` (a legacy native module), the New Architecture must be disabled. Verify that your `app.json` includes the following configuration:
```json
"newArchEnabled": false
```

Ensure that your API base URL in `src/api/index.ts` is configured to point to your backend server's local IP address (e.g., `http://192.168.1.100:3000/api`), not `localhost`, so the physical device can reach it over the local network.

---

## Building and Running the Application

Standard `Expo Go` cannot be used for this project due to the inclusion of custom native code (the Voice recognition module). You must build a custom Development Client.

### Option A: Local Build (Recommended)
This approach bypasses cloud queue times and compiles the application directly on your machine.
```bash
npx expo run:android
```
This command will compile the app using your local JDK and Android SDK, install it on the connected physical device or emulator, and start the Metro bundler automatically.

### Option B: Cloud Build via EAS
If local compilation is not possible, you can use Expo Application Services (EAS) to build the APK in the cloud.
1. Configure the project for EAS:
   ```bash
   eas build:configure
   ```
2. Run the cloud build for Android:
   ```bash
   eas build --profile development --platform android
   ```
3. Once the build is finished, download and install the provided APK on your Android device.
4. Start the local development server:
   ```bash
   npx expo start --dev-client
   ```
5. Open the installed application on your device and scan the QR code displayed in your terminal to load the JavaScript bundle.
