# Neon Missile Command (Three.js)

A vibrant modern remake of Missile Command built with Three.js and Tone.js.

## Run

```bash
npm install
npm run dev
```

Then open the local Vite URL in your browser.

## Controls

- Click **Start Mission**.
- Use the mouse to click in the sky and launch interceptor missiles.
- The nearest active base fires, and each base has limited ammo per wave.
- Protect all cities as waves increase in intensity.

## Features

- Core Missile Command loop: cities, bases, wave progression, limited ammo, and mouse targeting.
- Modern neon 3D visual treatment with bloom, shader sky, particles, and animated lighting.
- Procedural audio and techno soundtrack using Tone.js.
- Persistent high score via browser `localStorage`.
