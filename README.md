# Pharmacy Schedule Manager

A web-based scheduling system for pharmacy technicians with intelligent rotation logic, fairness tracking, and coverage monitoring.

## Features

### Core Scheduling Algorithm
- **2:1 Ratio**: 2 techs start Up Front for every 1 in Production
- **Automatic Fairness**: Tracks each tech's history to ensure balanced position assignments over time
- **Position Switching**: Every tech splits their shift equally between Up Front and Production
- **Smart Lunch Breaks**: 30-minute lunch calculated at shift midpoint, switch happens after lunch

### Coverage Monitoring
- **Real-time Warnings**:
  - Red alerts for critical understaffing (below minimum coverage)
  - Yellow warnings for suboptimal staffing levels
- **Time-based Requirements**:
  - 7-8 AM: Minimum 1 Up Front
  - 8 AM - 9 PM: Minimum 2 Up Front (prefer 3-4)
  - 9-10 PM: Minimum 1 Up Front

### Roster Management
- Save tech roster with default shift times
- Quick daily scheduling with checkboxes
- Adjust times as needed without changing defaults
- Persistent storage in browser

### Daily Adjustments
- **Call Out**: Remove tech from schedule
- **Time Changes**: Modify start/end times for individual techs
- **Real-time Updates**: Schedule recalculates automatically

## How to Use

### First Time Setup
1. Click "Manage Roster"
2. Add each tech with their typical shift times
3. Click "Hide Roster" when done

### Daily Workflow
1. Check the boxes for techs working today
2. Adjust times if needed (overtime, late arrival, etc.)
3. Review the generated schedule
4. Check coverage warnings
5. Handle call-outs by clicking "Call Out" button

### Understanding the Schedule
- **Start Position**: Where each tech begins their shift
- **Lunch**: Calculated 30-minute break at shift midpoint
- **Switch**: Time when tech changes positions (after lunch)
- **End Position**: Where tech finishes their shift

## Running the App

### Development Mode
```bash
npm install
npm run dev
```
Access at: http://localhost:3000

### Production Build
```bash
npm run build
npm run preview
```

### Access on Mobile
When running `npm run dev`, the server is accessible on your local network.
Find your computer's IP address and access from iPhone:
```
http://YOUR_IP_ADDRESS:3000
```

## Technology Stack
- React 19
- Vite (fast build tool)
- CSS3 (responsive design)
- LocalStorage (data persistence)

## Browser Compatibility
Works on:
- iPhone (Safari, Chrome)
- MacBook (Safari, Chrome, Firefox)
- Windows (Chrome, Edge, Firefox)

## Data Storage
All data is stored locally in your browser:
- Tech roster with default times
- Fairness tracking history
- No server required - works offline after initial load
