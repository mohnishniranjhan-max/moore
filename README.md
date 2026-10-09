# MoorSense (Ocean Sentry) 🌊
### Mooring Digital Twin, Real-Time Maritime Intelligence & Satellite Earth Observation Platform

![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react)
![Three.js](https://img.shields.io/badge/Three.js-WebGL2.0-black?style=flat-square&logo=three.dot.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi)
![Python](https://img.shields.io/badge/Python-3.11%20%2F%203.12%20%2F%203.13-3776AB?style=flat-square&logo=python)
![MediaPipe](https://img.shields.io/badge/AI%20Vision-Google%20MediaPipe-00A67E?style=flat-square&logo=google)
![Hardware Accelerated](https://img.shields.io/badge/Hardware%20Acceleration-GPU%20%2B%20CPU%20Balanced-76B900?style=flat-square&logo=nvidia)
![INCOIS & NOAA](https://img.shields.io/badge/Data-INCOIS%20%2B%20NOAA%20SOS%20%2B%20ARGO-005596?style=flat-square)
![India EEZ](https://img.shields.io/badge/Maritime%20Domain-India%20EEZ%20Boundary-FF9933?style=flat-square)

**MoorSense** is a state-of-the-art 3D oceanographic digital twin, mooring line tension/catenary physics engine, and maritime intelligence platform. It bridges INCOIS numerical ocean supercomputer models, NOAA Science On a Sphere (SOS) live satellite cloud composites, physical in-situ ARGO float arrays, autonomous underwater gliders, and deep-sea OMNI mooring buoys.

---

## ⚡ Hardware Acceleration Architecture (CPU + GPU Split)

MoorSense leverages a balanced dual-engine architecture designed for 60 FPS rendering and rapid physics simulations without resource starvation:

```
┌────────────────────────────────────────┐     ┌────────────────────────────────────────┐
│           GPU ACCELERATION             │     │            CPU ARCHITECTURE            │
│  (Hardware WebGL & Vision Inference)   │     │   (Physics, Analytics & API Engine)    │
├────────────────────────────────────────┤     ├────────────────────────────────────────┤
│ • Three.js 3D Earth Globe Engine       │     │ • Catenary Mooring Physics Solvers     │
│ • PBR Atmosphere & Cloud Shader Passes │     │ • GEBCO Bathymetry Grid Interpolation  │
│ • Google MediaPipe Hand AI (GPU WASM)  │     │ • In-Situ & Numerical QC Validation    │
│ • Volumetric Marine Caustics & Waves   │     │ • FastAPI Async IO & Telemetry Cache   │
│ • Canvas 'high-performance' Profile    │     │ • Buoy Ingestion & Trajectory Engine   │
└────────────────────────────────────────┘     └────────────────────────────────────────┘
```

---

## 🌟 Key Features

### 1. Mooring Digital Twin & Catenary Line Physics
* **Multi-Segment Catenary Solver:** Computes quasi-static line tension, anchor pull-angle, line payout, and touchdown points across varying depths and currents.
* **Tension Utilization & Safety Factors:** Real-time calculation of line breaking load margins ($SF \ge 2.0$), identifying snap risks or drag conditions.
* **GEBCO Bathymetric Integration:** Accurate sea-floor depth lookups anchoring mooring arrays in real topographic context.
* **OMNI & Met-Ocean Buoy Monitoring:** High-frequency monitoring of moored buoy networks (e.g., `BD08`, `BD09`, `BD10`, `AD01-AD05`).

### 2. Live NOAA Real-Time Satellite Clouds
* **NOAA Science On a Sphere (SOS):** Automatic ingestion of near-real-time global infrared satellite cloud composites updated on a ~10-minute cadence.
* **Transparent Shader Overlay:** Cloud layers mapped equirectangularly over the digital twin with atmospheric light extinction and ground shadow casting.
* **Seamless Crossfading:** Progressive alpha blend between live satellite snapshots without visual stutter.

### 3. Photorealistic 3D Planetary Engine (Three.js & WebGL)
* **PBR Earth Shader:** High-definition continental topography with depth-graded bathymetric water coloring.
* **Volumetric Atmosphere:** Rayleigh horizon halo and Mie scattering rim sheen.
* **Global Ocean Currents & Monsoon Winds:** Dynamic GPU particle streamlines visualizing seasonal monsoon patterns, trade winds, and ocean drift velocities.

### 4. Ground-Truth Validation & Anomaly Detection
* **Model vs. In-Situ Cross-Validation:** Direct side-by-side comparison between INCOIS numerical models and live ARGO float / IoT buoy observations.
* **Automated Variance Analytics:** Computes $\Delta T$, $\Delta S$, $\Delta H$, and $\Delta\text{Chl}$, raising real-time alerts on significant deviations.
* **BGC-Argo Ocean Acidification & pH Engine:** Temperature-compensated Nernst formulation computing seawater pH and Aragonite saturation states ($\Omega_{\text{arag}}$).

### 5. Touchless AI Hand Gesture Navigation (Google MediaPipe)
* **Zero-Touch Control:** 21-point webcam hand tracking powered by MediaPipe running directly on the GPU.
* **Gesture Controls:**
  * ✊ **Closed Fist:** Rotate planetary globe and orbit camera.
  * 👐 **Two Hands:** Pinch / expand hand distance to dynamically zoom in and out.
  * 🤏 **Index-Thumb Pinch:** Lock on and inspect buoy/station telemetry.
  * 🖐️ **Open Palm:** Smooth crosshair cursor aiming.

### 6. Subsurface Dive & Marine Ecosystem Simulation
* **Underwater Column Mode:** Gerstner surface waves, dynamic buoyancy simulation, light caustics, and marine snow particles.
* **Stratified Marine Fauna:** Depth-accurate marine life simulation across Photic (0–10m), Twilight (50–100m), and Abyssal (500m+) bathymetric layers.

---

## 🛠️ Technology Stack

| Domain | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Vanilla CSS Design System |
| **3D Graphics** | Three.js, React Three Fiber (`@react-three/fiber`), Drei (`@react-three/drei`) |
| **AI Vision & Gestures** | Google MediaPipe (`@mediapipe/tasks-vision`) with WebGL GPU delegate |
| **Backend API** | FastAPI, Uvicorn, Pydantic v2, Python-dotenv |
| **Data & Scientific Computing** | NumPy, Pandas, SciPy, NetCDF4, Xarray, Pillow, PyArrow |
| **Data Sources** | INCOIS (O.A.S.), NOAA SOS, Copernicus Marine (CMEMS), ArgoVis In-Situ API |

---

## 🚀 Quick Start Guide

### Prerequisites
* **Node.js** (v18.0 or newer)
* **Python** (v3.10 to v3.13)
* **Webcam** (Optional, for touchless hand gesture control)

---

### Step 1: Set Up and Start Backend

```powershell
# 1. Navigate to the backend directory
cd backend

# 2. Create and activate a Python virtual environment
# Windows (PowerShell):
python -m venv .venv
.\.venv\Scripts\activate

# Linux / macOS:
# python3 -m venv .venv
# source .venv/bin/activate

# 3. Install required Python packages
pip install -r requirements.txt

# 4. Copy environment configuration (if not already created)
cp .env.example .env

# 5. Start the FastAPI development server
uvicorn app.main:app --reload --port 8000
```

* **API Documentation (Swagger UI):** [http://localhost:8000/docs](http://localhost:8000/docs)
* **Health Check:** [http://localhost:8000/api/health](http://localhost:8000/api/health)
* **Live Cloud Metadata:** [http://localhost:8000/api/clouds/latest](http://localhost:8000/api/clouds/latest)

---

### Step 2: Set Up and Start Frontend

In a separate terminal:

```powershell
# From the project root (c:\Users\mohnish\MOORSENSE)
npm install

# Launch Vite development server
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## 📡 API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Backend service health check and component status. |
| `GET` | `/api/clouds/latest` | Metadata for NOAA SOS real-time satellite cloud composites. |
| `GET` | `/api/clouds/texture/latest` | Latest processed transparent satellite cloud PNG. |
| `GET` | `/api/buoys` | Fleet list of all active deep-sea moored buoys (OMNI array). |
| `GET` | `/api/buoys/{buoy_id}` | Detailed telemetry and mooring line response for a specific buoy. |
| `GET` | `/api/stations` | All observation stations, gliders, and ARGO floats. |
| `GET` | `/api/ocean/observations` | In-situ oceanographic measurements (SST, SSS, pH, Chl-a). |
| `GET` | `/api/ocean/model` | INCOIS numerical forecast simulation values. |
| `GET` | `/api/ocean/comparison` | Collocated model vs. observation delta analysis ($\Delta T, \Delta S$). |
| `GET` | `/api/ocean/anomalies` | Detected anomalies with confidence and risk classification. |

---

## 📂 Project Structure

```text
MOORSENSE/
├── backend/
│   ├── app/
│   │   ├── api/             # FastAPI route controllers (buoys, clouds, ocean, stations, etc.)
│   │   ├── services/        # Cloud sync service, anomaly scoring, ocean service
│   │   ├── models/          # Pydantic schemas and response models
│   │   └── main.py          # FastAPI application entry point & CORS
│   ├── services/
│   │   ├── buoy/            # Buoy runtime, cache, and telemetry models
│   │   ├── mooring/         # Catenary solver, bathymetry, risk engine & environmental forces
│   │   └── replay/          # Historical simulation replay service
│   ├── data/                # Sample datasets, GEBCO bathymetry cache & textures
│   ├── requirements.txt     # Python backend dependencies
│   └── .env.example         # Example environment configuration
├── public/
│   ├── data/                # GeoJSON boundaries (India EEZ, bathymetry contours)
│   └── textures/            # High-res Earth surface, specular & cloud textures
├── src/
│   ├── components/
│   │   ├── scene/           # 3D WebGL Globe (Earth, CloudLayer, BuoyMarkers, Wind, Currents)
│   │   ├── localocean/      # Underwater local ocean sandbox & marine life shaders
│   │   └── ui/              # Control dock, Hand gesture HUD, Station & Buoy panels
│   ├── hooks/               # useHandGesture (MediaPipe), useOceanData
│   ├── services/            # Frontend API clients (cloudService.ts, oceanApi.ts, etc.)
│   ├── pages/
│   │   ├── Explorer.tsx     # Primary 3D Digital Twin Command Center
│   │   └── GestureLab.tsx   # Hand gesture calibration lab
│   └── main.tsx             # React entry point
├── package.json
└── README.md
```

---

## 📜 Acknowledgments & License
Developed for advanced ocean observation and maritime domain awareness. Ingests data from **INCOIS**, **NOAA Science On a Sphere**, **Copernicus Marine Service (CMEMS)**, and **ArgoVis**.
