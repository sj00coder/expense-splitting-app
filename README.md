# Split

Split is a shared expense app for trips and housemates. People in a group see the same expenses, balances, and history.

A group is a trip or a house with one currency (USD, EUR, GBP, INR, CAD, or AUD). Add an expense and split it equally, by exact amounts, or by shares. The app shows a simplified “who owes whom” list, records settle-up payments, and exports the history as CSV. There are no accounts or passwords: each device keeps a user id, you pick a display name, and anyone with the group code can join.

The app is Expo (SDK 58) with Expo Router. The API is FastAPI with a SQLite file at `backend/data/app.db`, created on first start.

## Run the API

From the repo root:

```bash
python -m venv backend/.venv
```

Windows:

```bash
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
backend/.venv/Scripts/python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

macOS and Linux:

```bash
backend/.venv/bin/python -m pip install -r backend/requirements.txt
backend/.venv/bin/python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

The API listens on [http://localhost:8000](http://localhost:8000).

## Run the app

In a second terminal, from the repo root:

```bash
npm install
npx expo start
```

Then open the web build, an Android emulator, an iOS simulator, or Expo Go. Shortcuts:

```bash
npm run web
npm run android
npm run ios
```

The app calls `http://localhost:8000` unless you set `EXPO_PUBLIC_API_URL`. A phone on the same network cannot use `localhost`; point it at this computer’s LAN address and restart Expo:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:8000 npx expo start
```

On first launch, save a display name on the Profile tab. After that you can create a group or join one with its code.

## Checks

```bash
backend/.venv/Scripts/python -m pytest
npx tsc --noEmit
npx expo lint
```

On macOS and Linux, call pytest with `backend/.venv/bin/python` instead.
