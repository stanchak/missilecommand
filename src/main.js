import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AudioManager } from './audio.js';

const WORLD = Object.freeze({
  left: -620,
  right: 620,
  bottom: -310,
  top: 365,
});

const BASE_POSITIONS = Object.freeze([-420, 0, 420]);
const CITY_POSITIONS = Object.freeze([-560, -340, -170, 170, 340, 560]);
const MAX_BASE_AMMO = 10;
const HIGH_SCORE_KEY = 'neon-missile-command-high-score';
const MISSILE_PALETTES = Object.freeze({
  enemy: Object.freeze({
    lightHead: 0xffd574,
    darkHead: 0x3d1126,
    lightTrail: 0xff8d4a,
    darkTrail: 0x5d2133,
  }),
  enemySplit: Object.freeze({
    lightHead: 0xff8de1,
    darkHead: 0x2a0a37,
    lightTrail: 0xff57b2,
    darkTrail: 0x4d1a5d,
  }),
  player: Object.freeze({
    lightHead: 0x90f7ff,
    darkHead: 0x082e45,
    lightTrail: 0x54dcff,
    darkTrail: 0x0b425f,
  }),
});
const OUTLINE_COLORS = Object.freeze({
  dark: 0x04070f,
  light: 0xf2fdff,
});

class NeonMissileCommand {
  constructor() {
    this.container = document.getElementById('game-container');
    this.scoreEl = document.getElementById('score');
    this.highScoreEl = document.getElementById('high-score');
    this.waveEl = document.getElementById('wave');
    this.citiesEl = document.getElementById('cities');
    this.statusEl = document.getElementById('status');
    this.stageBannerEl = document.getElementById('stage-banner');
    this.startButton = document.getElementById('start-button');
    this.audioButton = document.getElementById('audio-button');

    this.audio = new AudioManager();
    this.audioMuted = false;
    this.audioStarted = false;

    this.highScore = this._loadHighScore();
    this.highScoreBeforeMission = this.highScore;

    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pointerPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.pointerHit = new THREE.Vector3();
    this.currentTime = 0;
    this._tmpColorA = new THREE.Color();
    this._tmpColorB = new THREE.Color();
    this._tmpVecA = new THREE.Vector3();
    this._tmpTrailDir = new THREE.Vector3();
    this._trailUp = new THREE.Vector3(0, 1, 0);

    this.wave = 0;
    this.score = 0;
    this.running = false;
    this.waveTransition = false;
    this.waveTransitionTimer = 0;

    this.enemySpawned = 0;
    this.enemyToSpawn = 0;
    this.enemySpawnTimer = 0;
    this.spawnRate = 0.9;

    this.cities = [];
    this.bases = [];
    this.enemyMissiles = [];
    this.playerMissiles = [];
    this.explosions = [];
    this.sparkBursts = [];

    this.baseBloomStrength = 0.58;
    this.baseExposure = 0.95;
    this.baseCameraPos = new THREE.Vector3(0, 65, 920);
    this.baseLookTarget = new THREE.Vector3(0, 10, 0);
    this.cutscene = {
      active: false,
      timer: 0,
      duration: 3.15,
      bonus: 0,
      wave: 0,
    };

    this._initRenderer();
    this._buildScene();
    this._bindEvents();
    this._resetMissionState(true);
    this._setStatus('Click Start Mission, then defend the cities with your mouse.');

    this.animate = this.animate.bind(this);
    this.renderer.setAnimationLoop(this.animate);
  }

  _loadHighScore() {
    try {
      return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
    } catch (_error) {
      return 0;
    }
  }

  _saveHighScore() {
    try {
      localStorage.setItem(HIGH_SCORE_KEY, String(this.highScore));
    } catch (_error) {
      // Ignore persistence failures in restricted environments.
    }
  }

  _initRenderer() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x020611, 720, 1950);

    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      4000,
    );
    this.camera.position.set(0, 65, 920);
    this.camera.lookAt(0, 10, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.baseExposure;

    this.container.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.baseBloomStrength,
      0.24,
      0.42,
    );
    this.composer.addPass(this.bloomPass);

    this.environmentGroup = new THREE.Group();
    this.structureGroup = new THREE.Group();
    this.dynamicGroup = new THREE.Group();
    this.scene.add(this.environmentGroup, this.structureGroup, this.dynamicGroup);
  }

  _buildScene() {
    this._buildBackdrop();
    this._buildStars();
    this._buildGround();
    this._buildLights();
    this._buildCutsceneFx();
  }

  _buildBackdrop() {
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(4600, 2800),
      new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform float time;

          float hash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 78.233);
            return fract(p.x * p.y);
          }

          void main() {
            vec3 horizon = vec3(0.01, 0.08, 0.20);
            vec3 zenith = vec3(0.00, 0.015, 0.06);
            vec3 color = mix(horizon, zenith, smoothstep(0.0, 1.0, vUv.y));

            float drift = sin((vUv.x * 5.5) + (time * 0.06)) * sin((vUv.y * 7.0) - (time * 0.05));
            color += vec3(0.00, 0.012, 0.03) * drift;

            vec2 starUV = vUv * vec2(170.0, 140.0);
            float n = hash(floor(starUV));
            float twinkle = 0.65 + 0.35 * sin(time * (0.7 + n * 3.2) + n * 6.2831);
            float star = step(0.9983, n) * twinkle;
            float brightStar = step(0.9996, n) * (0.8 + 0.2 * sin((time * 2.0) + (n * 10.0)));
            color += vec3(0.45, 0.72, 1.0) * star;
            color += vec3(0.75, 0.90, 1.0) * brightStar;

            gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
          }
        `,
        depthWrite: false,
      }),
    );

    backdrop.position.set(0, 90, -1450);
    this.environmentGroup.add(backdrop);
    this.backdropMaterial = backdrop.material;
  }

  _buildStars() {
    const starCount = 1500;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const colorA = new THREE.Color(0x57dfff);
    const colorB = new THREE.Color(0xffa267);

    for (let i = 0; i < starCount; i += 1) {
      const i3 = i * 3;
      positions[i3 + 0] = THREE.MathUtils.randFloatSpread(3400);
      positions[i3 + 1] = THREE.MathUtils.randFloat(-120, 1300);
      positions[i3 + 2] = THREE.MathUtils.randFloat(-2200, -140);

      const mix = Math.random();
      const col = colorA.clone().lerp(colorB, mix * 0.45);
      colors[i3 + 0] = col.r;
      colors[i3 + 1] = col.g;
      colors[i3 + 2] = col.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const stars = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 3.2,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
      }),
    );

    stars.position.z = -230;
    this.environmentGroup.add(stars);
    this.stars = stars;
  }

  _buildGround() {
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(1720, 76, 280),
      new THREE.MeshStandardMaterial({
        color: 0x071b2a,
        emissive: 0x05253a,
        emissiveIntensity: 0.52,
        metalness: 0.55,
        roughness: 0.48,
      }),
    );
    deck.position.set(0, WORLD.bottom - 42, -130);
    this.environmentGroup.add(deck);

    const stripLeft = new THREE.Mesh(
      new THREE.BoxGeometry(1700, 5, 14),
      new THREE.MeshBasicMaterial({
        color: 0x2cf7d4,
        transparent: true,
        opacity: 0.72,
      }),
    );
    stripLeft.position.set(0, WORLD.bottom - 15, -12);

    const stripRight = stripLeft.clone();
    stripRight.material = stripLeft.material.clone();
    stripRight.material.color = new THREE.Color(0xff8a47);
    stripRight.position.z = 24;

    this.environmentGroup.add(stripLeft, stripRight);

    const grid = new THREE.GridHelper(1760, 30, 0x33ffe0, 0x155576);
    grid.position.set(0, WORLD.bottom - 8, -130);
    grid.material.opacity = 0.36;
    grid.material.transparent = true;
    this.environmentGroup.add(grid);
    this.groundGrid = grid;
  }

  _buildLights() {
    const ambient = new THREE.AmbientLight(0xa6e7ff, 0.34);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0x7edbff, 0.75);
    key.position.set(-200, 300, 500);
    this.scene.add(key);

    const fill = new THREE.PointLight(0x35ffd9, 1.0, 1300, 2.0);
    fill.position.set(-520, -130, 220);
    this.scene.add(fill);

    const hot = new THREE.PointLight(0xff7c39, 1.15, 1300, 1.8);
    hot.position.set(520, -120, 250);
    this.scene.add(hot);

    this.pulseLightA = fill;
    this.pulseLightB = hot;
  }

  _buildCutsceneFx() {
    this.cutsceneGroup = new THREE.Group();
    this.cutsceneGroup.visible = false;
    this.scene.add(this.cutsceneGroup);

    this.cutsceneCore = new THREE.Mesh(
      new THREE.SphereGeometry(24, 24, 24),
      new THREE.MeshBasicMaterial({
        color: 0x7bfff1,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.cutsceneCore.position.set(0, WORLD.bottom + 96, -8);

    this.cutsceneRingA = new THREE.Mesh(
      new THREE.TorusGeometry(50, 3.2, 14, 90),
      new THREE.MeshBasicMaterial({
        color: 0x53e6ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.cutsceneRingA.rotation.x = Math.PI * 0.5;
    this.cutsceneRingA.position.copy(this.cutsceneCore.position);

    this.cutsceneRingB = new THREE.Mesh(
      new THREE.TorusGeometry(42, 2.2, 10, 70),
      new THREE.MeshBasicMaterial({
        color: 0xffb36b,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.cutsceneRingB.rotation.x = Math.PI * 0.5;
    this.cutsceneRingB.position.copy(this.cutsceneCore.position);

    this.cutsceneFlash = new THREE.Mesh(
      new THREE.PlaneGeometry(2200, 1400),
      new THREE.MeshBasicMaterial({
        color: 0xbff9ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.cutsceneFlash.position.set(0, 120, 420);
    this.cutsceneFlash.renderOrder = 80;

    this.cutsceneBeams = [];
    for (let i = 0; i < CITY_POSITIONS.length; i += 1) {
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6, 2.6, 240, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0x53e6ff : 0x78ffdc,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      beam.position.set(CITY_POSITIONS[i], WORLD.bottom + 132, 4);
      beam.visible = false;
      this.cutsceneBeams.push(beam);
      this.cutsceneGroup.add(beam);
    }

    this.cutsceneGroup.add(this.cutsceneCore, this.cutsceneRingA, this.cutsceneRingB, this.cutsceneFlash);
  }

  _bindEvents() {
    this.handleResize = this.handleResize.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handleStartClick = this.handleStartClick.bind(this);
    this.handleAudioClick = this.handleAudioClick.bind(this);

    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.startButton.addEventListener('click', this.handleStartClick);
    this.audioButton.addEventListener('click', this.handleAudioClick);
  }

  handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  }

  async handleStartClick() {
    if (!this.audioStarted) {
      await this.audio.init();
      this.audioStarted = true;
      this.audio.setMuted(this.audioMuted);
    } else {
      this.audio.resumeIfSuspended();
    }

    this.audio.newMission();
    this.highScoreBeforeMission = this.highScore;
    this._resetMissionState(false);
    this.running = true;
    this.startButton.textContent = 'Restart Mission';
    this._beginNextWave();
  }

  handleAudioClick() {
    this.audioMuted = !this.audioMuted;
    this.audio.setMuted(this.audioMuted);
    if (!this.audioMuted) {
      this.audio.resumeIfSuspended();
    }
    this.audioButton.textContent = this.audioMuted ? 'Unmute' : 'Mute';
  }

  _resetMissionState(initialLoad) {
    this.wave = 0;
    this.score = 0;
    this.running = false;
    this.waveTransition = false;
    this.waveTransitionTimer = 0;

    this.enemySpawned = 0;
    this.enemyToSpawn = 0;
    this.enemySpawnTimer = 0;
    this.spawnRate = 0.9;

    this._endCutscene(true);
    this._clearDynamicEntities();
    this._rebuildDefenses();

    this._syncHud();
    this.startButton.textContent = initialLoad ? 'Start Mission' : 'Restart Mission';
  }

  _clearDynamicEntities() {
    for (const missile of this.enemyMissiles) {
      this._disposeObject3D(missile.group);
    }

    for (const missile of this.playerMissiles) {
      this._disposeObject3D(missile.group);
    }

    for (const explosion of this.explosions) {
      this._disposeObject3D(explosion.core);
      this._disposeObject3D(explosion.ring);
    }

    for (const burst of this.sparkBursts) {
      this._disposeObject3D(burst.points);
    }

    this.enemyMissiles.length = 0;
    this.playerMissiles.length = 0;
    this.explosions.length = 0;
    this.sparkBursts.length = 0;
  }

  _rebuildDefenses() {
    this._clearGroup(this.structureGroup);
    this.cities.length = 0;
    this.bases.length = 0;

    for (let i = 0; i < CITY_POSITIONS.length; i += 1) {
      this.cities.push(this._createCity(CITY_POSITIONS[i], i));
    }

    for (let i = 0; i < BASE_POSITIONS.length; i += 1) {
      this.bases.push(this._createBase(BASE_POSITIONS[i], i));
    }
  }

  _createCity(x, index) {
    const group = new THREE.Group();
    group.position.set(x, WORLD.bottom + 8, THREE.MathUtils.randFloatSpread(54));

    const basePlate = new THREE.Mesh(
      new THREE.BoxGeometry(86, 10, 32),
      new THREE.MeshStandardMaterial({
        color: 0x0a2431,
        emissive: 0x124c62,
        emissiveIntensity: 0.4,
        metalness: 0.6,
        roughness: 0.36,
      }),
    );
    basePlate.position.set(0, 2, 0);
    group.add(basePlate);

    const tonePalette = [0x2affcb, 0x39f0ff, 0xff8f4f];

    for (let i = 0; i < 6; i += 1) {
      const height = THREE.MathUtils.randFloat(16, 42);
      const width = THREE.MathUtils.randFloat(8, 16);
      const depth = THREE.MathUtils.randFloat(8, 15);
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({
          color: 0x112f3c,
          emissive: tonePalette[(index + i) % tonePalette.length],
          emissiveIntensity: 0.7,
          metalness: 0.5,
          roughness: 0.3,
        }),
      );
      building.position.set(
        -30 + i * 12,
        7 + height * 0.5,
        THREE.MathUtils.randFloat(-8, 8),
      );
      group.add(building);
    }

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(3.4, 12, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffd96b,
        transparent: true,
        opacity: 0.95,
      }),
    );
    beacon.position.set(0, 30, 0);
    group.add(beacon);

    this.structureGroup.add(group);

    return {
      kind: 'city',
      alive: true,
      position: new THREE.Vector3(x, WORLD.bottom + 20, 0),
      group,
      beacon,
    };
  }

  _createBase(x, index) {
    const group = new THREE.Group();
    group.position.set(x, WORLD.bottom + 10, 0);

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(28, 36, 12, 24),
      new THREE.MeshStandardMaterial({
        color: 0x082936,
        emissive: 0x0f4a5f,
        emissiveIntensity: 0.52,
        metalness: 0.58,
        roughness: 0.34,
      }),
    );
    group.add(pad);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(18, 26, 18, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({
        color: 0x0f3148,
        emissive: index % 2 === 0 ? 0x2cf5d8 : 0x34e4ff,
        emissiveIntensity: 0.75,
        metalness: 0.24,
        roughness: 0.27,
      }),
    );
    dome.position.y = 6;
    group.add(dome);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(30, 1.8, 10, 40),
      new THREE.MeshBasicMaterial({
        color: 0x69ffed,
        transparent: true,
        opacity: 0.76,
      }),
    );
    ring.rotation.x = Math.PI * 0.5;
    ring.position.y = 5;
    group.add(ring);

    const ammoPips = [];
    for (let i = 0; i < MAX_BASE_AMMO; i += 1) {
      const pip = new THREE.Mesh(
        new THREE.BoxGeometry(3, 5, 2),
        new THREE.MeshBasicMaterial({ color: 0xffd76a }),
      );
      pip.position.set(-18 + i * 4, 18, 0);
      ammoPips.push(pip);
      group.add(pip);
    }

    this.structureGroup.add(group);

    return {
      kind: 'base',
      alive: true,
      ammo: MAX_BASE_AMMO,
      position: new THREE.Vector3(x, WORLD.bottom + 20, 0),
      group,
      ring,
      ammoPips,
      dome,
    };
  }

  _beginNextWave() {
    this._endCutscene();
    this.wave += 1;
    this.waveTransition = false;

    for (const base of this.bases) {
      if (base.alive) {
        base.ammo = MAX_BASE_AMMO;
        this._refreshBaseVisual(base);
      }
    }

    this.enemySpawned = 0;
    this.enemyToSpawn = 10 + (this.wave - 1) * 4;
    this.spawnRate = Math.max(0.23, 0.96 - (this.wave - 1) * 0.065);
    this.enemySpawnTimer = 0.6;

    this._syncHud();
    this._setStatus(`Wave ${this.wave} incoming. Defend all remaining cities.`);
    this.audio.waveStart(this.wave);
  }

  _completeWave() {
    this.waveTransition = true;
    this.waveTransitionTimer = this.cutscene.duration;

    const survivingCities = this._aliveCities().length;
    const ammoBonus = this.bases.reduce((sum, base) => sum + (base.alive ? base.ammo : 0), 0) * 5;
    const cityBonus = survivingCities * 100;
    const bonus = ammoBonus + cityBonus;

    if (bonus > 0) {
      this._addScore(bonus);
    }

    this._setStatus(`Wave ${this.wave} cleared. Bonus ${bonus}. Re-arming silos...`);
    this._startCutscene(bonus);
  }

  _setStatus(text) {
    this.statusEl.textContent = text;
  }

  _syncHud() {
    this.scoreEl.textContent = this.score.toLocaleString();
    this.highScoreEl.textContent = this.highScore.toLocaleString();
    this.waveEl.textContent = String(this.wave || 1);
    this.citiesEl.textContent = String(this._aliveCities().length);
  }

  _addScore(amount) {
    this.score += amount;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this._saveHighScore();
    }
    this._syncHud();
  }

  _aliveCities() {
    return this.cities.filter((city) => city.alive);
  }

  _aliveBasesWithAmmo() {
    return this.bases.filter((base) => base.alive && base.ammo > 0);
  }

  handlePointerDown(event) {
    if (this.audioStarted) {
      this.audio.resumeIfSuspended();
    }

    if (!this.running || this.waveTransition) {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.pointerPlane, this.pointerHit)) {
      return;
    }

    const target = this.pointerHit.clone();
    target.x = THREE.MathUtils.clamp(target.x, WORLD.left + 20, WORLD.right - 20);
    target.y = THREE.MathUtils.clamp(target.y, WORLD.bottom + 20, WORLD.top - 10);
    target.z = 0;

    const launchBase = this._pickLaunchBase(target.x);
    if (!launchBase) {
      this._setStatus('No interceptor missiles available in active bases.');
      this.audio.noAmmo();
      return;
    }

    launchBase.ammo -= 1;
    this._refreshBaseVisual(launchBase);

    this._spawnPlayerMissile(launchBase, target);
    this.audio.playerLaunch();
  }

  _pickLaunchBase(targetX) {
    const bases = this._aliveBasesWithAmmo();
    if (bases.length === 0) {
      return null;
    }

    let bestBase = bases[0];
    let bestDistance = Math.abs(bestBase.position.x - targetX);
    for (let i = 1; i < bases.length; i += 1) {
      const candidate = bases[i];
      const candidateDistance = Math.abs(candidate.position.x - targetX);
      if (candidateDistance < bestDistance) {
        bestDistance = candidateDistance;
        bestBase = candidate;
      }
    }

    return bestBase;
  }

  _pickEnemyTarget() {
    const aliveCities = this._aliveCities();
    const aliveBases = this.bases.filter((base) => base.alive);

    const weightedTargets = [];
    for (const city of aliveCities) {
      weightedTargets.push(city, city);
    }
    for (const base of aliveBases) {
      weightedTargets.push(base);
    }

    if (weightedTargets.length === 0) {
      return {
        type: 'ground',
        ref: null,
        position: new THREE.Vector3(
          THREE.MathUtils.randFloat(WORLD.left + 50, WORLD.right - 50),
          WORLD.bottom + 16,
          0,
        ),
      };
    }

    const chosen = weightedTargets[Math.floor(Math.random() * weightedTargets.length)];
    return {
      type: chosen.kind,
      ref: chosen,
      position: chosen.position.clone(),
    };
  }

  _createMissileVisual(missile, style) {
    missile.group = new THREE.Group();

    missile.headOuter = new THREE.Mesh(
      new THREE.SphereGeometry(style.headOuterRadius, 14, 14),
      new THREE.MeshBasicMaterial({
        color: OUTLINE_COLORS.dark,
        transparent: true,
        opacity: 0.94,
        toneMapped: false,
        depthTest: false,
        depthWrite: false,
      }),
    );
    missile.headOuter.renderOrder = 31;

    missile.headInner = new THREE.Mesh(
      new THREE.SphereGeometry(style.headInnerRadius, 14, 14),
      new THREE.MeshBasicMaterial({
        color: missile.palette.lightHead,
        transparent: true,
        opacity: 0.96,
        toneMapped: false,
        depthTest: false,
        depthWrite: false,
      }),
    );
    missile.headInner.renderOrder = 32;

    missile.trailOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(style.trailOuterRadius, style.trailOuterRadius, 1, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: OUTLINE_COLORS.dark,
        transparent: true,
        opacity: 0.86,
        blending: THREE.NormalBlending,
        toneMapped: false,
        depthTest: false,
        depthWrite: false,
      }),
    );
    missile.trailOuter.renderOrder = 29;

    missile.trailInner = new THREE.Mesh(
      new THREE.CylinderGeometry(style.trailInnerRadius, style.trailInnerRadius, 1, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: missile.palette.lightTrail,
        transparent: true,
        opacity: 0.96,
        blending: THREE.NormalBlending,
        toneMapped: false,
        depthTest: false,
        depthWrite: false,
      }),
    );
    missile.trailInner.renderOrder = 30;

    missile.group.add(missile.trailOuter, missile.trailInner, missile.headOuter, missile.headInner);
    this.dynamicGroup.add(missile.group);
  }

  _setTrailTransform(mesh, start, end) {
    const dir = this._tmpTrailDir.subVectors(end, start);
    const length = dir.length();

    if (length < 0.8) {
      mesh.visible = false;
      return;
    }

    mesh.visible = true;
    mesh.position.copy(start).addScaledVector(dir, 0.5);
    dir.multiplyScalar(1 / length);
    mesh.quaternion.setFromUnitVectors(this._trailUp, dir);
    mesh.scale.set(1, length, 1);
  }

  _updateMissileVisual(missile, time) {
    this._updateMissileContrast(missile, time);

    missile.headOuter.position.copy(missile.position);
    missile.headInner.position.copy(missile.position);
    this._setTrailTransform(missile.trailOuter, missile.start, missile.position);
    this._setTrailTransform(missile.trailInner, missile.start, missile.position);
  }

  _spawnEnemyMissile(origin = null) {
    const target = this._pickEnemyTarget();
    const start = origin
      ? origin.clone()
      : new THREE.Vector3(
        THREE.MathUtils.randFloat(WORLD.left + 10, WORLD.right - 10),
        THREE.MathUtils.randFloat(WORLD.top + 10, WORLD.top + 120),
        0,
      );

    const end = target.position.clone();
    const distance = start.distanceTo(end);
    if (distance <= 1) {
      return;
    }

    const missile = {
      start,
      end,
      position: start.clone(),
      distance,
      speed: THREE.MathUtils.randFloat(62, 86) + this.wave * 5.5,
      progress: 0,
      targetType: target.type,
      targetRef: target.ref,
      canSplit: this.wave >= 4 && !origin && Math.random() < Math.min(0.35, 0.07 + this.wave * 0.03),
      splitAt: THREE.MathUtils.randFloat(0.35, 0.68),
      didSplit: false,
    };

    missile.palette = missile.canSplit ? MISSILE_PALETTES.enemySplit : MISSILE_PALETTES.enemy;
    this._createMissileVisual(missile, {
      headOuterRadius: 5.2,
      headInnerRadius: 2.7,
      trailOuterRadius: 1.12,
      trailInnerRadius: 0.42,
    });
    this._updateMissileVisual(missile, this.currentTime);
    this.enemyMissiles.push(missile);
    this.audio.enemyLaunch();
  }

  _spawnPlayerMissile(base, target) {
    const start = new THREE.Vector3(base.position.x, base.position.y + 6, 0);
    const end = target.clone();
    const distance = start.distanceTo(end);
    if (distance <= 1) {
      return;
    }

    const missile = {
      start,
      end,
      position: start.clone(),
      distance,
      speed: 440 + this.wave * 16,
      progress: 0,
      palette: MISSILE_PALETTES.player,
    };
    this._createMissileVisual(missile, {
      headOuterRadius: 4.4,
      headInnerRadius: 2.25,
      trailOuterRadius: 0.98,
      trailInnerRadius: 0.36,
    });
    this._updateMissileVisual(missile, this.currentTime);
    this.playerMissiles.push(missile);
  }

  _spawnExplosion(position, type) {
    const defense = type === 'defense';
    const coreColor = defense ? 0x42f8ff : 0xff7c3f;
    const ringColor = defense ? 0x9bfdf6 : 0xffcf61;

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 18),
      new THREE.MeshBasicMaterial({
        color: coreColor,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    core.position.copy(position);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.26, 12, 38),
      new THREE.MeshBasicMaterial({
        color: ringColor,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.position.copy(position);

    this.dynamicGroup.add(core, ring);

    const explosion = {
      type,
      canDamageGround: !defense,
      position: position.clone(),
      radius: 0.5,
      maxRadius: defense
        ? THREE.MathUtils.randFloat(50, 72)
        : THREE.MathUtils.randFloat(36, 58),
      growth: defense ? 220 : 170,
      shrinking: false,
      core,
      ring,
    };

    this.explosions.push(explosion);
    this._spawnSparkBurst(position, coreColor, defense ? 16 : 24);
  }

  _spawnSparkBurst(position, color, count) {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const i3 = i * 3;
      positions[i3 + 0] = 0;
      positions[i3 + 1] = 0;
      positions[i3 + 2] = 0;

      const dir = new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(1),
        THREE.MathUtils.randFloatSpread(1),
        THREE.MathUtils.randFloatSpread(0.6),
      ).normalize();

      const speed = THREE.MathUtils.randFloat(40, 180);
      velocities[i3 + 0] = dir.x * speed;
      velocities[i3 + 1] = dir.y * speed;
      velocities[i3 + 2] = dir.z * speed;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color,
        size: 3.8,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );

    points.position.copy(position);
    this.dynamicGroup.add(points);

    this.sparkBursts.push({
      points,
      velocities,
      life: 0,
      maxLife: THREE.MathUtils.randFloat(0.5, 1.0),
    });
  }

  _refreshBaseVisual(base) {
    const ratio = base.alive ? base.ammo / MAX_BASE_AMMO : 0;

    for (let i = 0; i < base.ammoPips.length; i += 1) {
      base.ammoPips[i].visible = i < base.ammo;
    }

    if (base.alive) {
      base.ring.material.opacity = 0.25 + ratio * 0.75;
      base.ring.material.color.set(ratio > 0.3 ? 0x79fff3 : 0xffa55e);
      base.dome.material.emissiveIntensity = 0.34 + ratio * 0.65;
    } else {
      base.ring.material.opacity = 0.12;
      base.ring.material.color.set(0x4b4b4b);
      base.dome.material.emissiveIntensity = 0.05;
      base.dome.material.color.set(0x2a2a2a);
      base.dome.material.emissive.set(0x101010);
    }
  }

  _destroyCity(city) {
    if (!city.alive) {
      return;
    }

    city.alive = false;
    city.beacon.visible = false;
    city.group.rotation.z = THREE.MathUtils.randFloat(-0.14, 0.14);
    city.group.position.y -= 5;
    const burnColor = new THREE.Color(0x2a2a2a);

    city.group.traverse((node) => {
      if (node.isMesh && node.material) {
        if ('emissiveIntensity' in node.material) {
          node.material.emissiveIntensity *= 0.12;
        }
        if (node.material.color?.isColor) {
          node.material.color.lerp(burnColor, 0.7);
        }
      }
    });

    this.audio.cityDestroyed();
    this._spawnSparkBurst(city.position, 0xff7d42, 26);
    this._syncHud();
  }

  _destroyBase(base) {
    if (!base.alive) {
      return;
    }

    base.alive = false;
    base.ammo = 0;
    base.group.rotation.x = THREE.MathUtils.randFloat(-0.2, -0.08);
    base.group.position.y -= 4;
    this._refreshBaseVisual(base);
    this.audio.cityDestroyed();
    this._spawnSparkBurst(base.position, 0xff7d42, 20);
  }

  _detonateEnemyMissile(index, pointsAwarded) {
    const missile = this.enemyMissiles[index];
    if (!missile) {
      return;
    }

    const hitPos = missile.position.clone();
    this._disposeObject3D(missile.group);
    this.enemyMissiles.splice(index, 1);

    this._spawnExplosion(hitPos, 'warhead');

    if (pointsAwarded > 0) {
      this._addScore(pointsAwarded);
      this.audio.intercept();
    }
  }

  _enemyMissileImpact(missile, index) {
    this._spawnExplosion(missile.end, 'warhead');

    if (missile.targetType === 'city' && missile.targetRef?.alive) {
      this._destroyCity(missile.targetRef);
    } else if (missile.targetType === 'base' && missile.targetRef?.alive) {
      this._destroyBase(missile.targetRef);
    }

    this.audio.enemyImpact();

    this._disposeObject3D(missile.group);
    this.enemyMissiles.splice(index, 1);
  }

  _gameOver() {
    this.running = false;
    this.waveTransition = false;
    this._endCutscene(true);
    this.audio.gameOver();

    const message = this.score > this.highScoreBeforeMission
      ? `Mission failed. New high score: ${this.highScore.toLocaleString()}.`
      : `Mission failed. Score ${this.score.toLocaleString()}. High ${this.highScore.toLocaleString()}.`;

    this._setStatus(`${message} Press Start Mission to play again.`);
    this.startButton.textContent = 'Start Mission';
  }

  _applyExplosionCollisions(explosion) {
    for (let i = this.enemyMissiles.length - 1; i >= 0; i -= 1) {
      const missile = this.enemyMissiles[i];
      if (missile.position.distanceTo(explosion.position) <= explosion.radius) {
        const points = explosion.type === 'defense' ? 30 : 18;
        this._detonateEnemyMissile(i, points);
      }
    }

    if (!explosion.canDamageGround) {
      return;
    }

    const damageRadius = Math.max(12, explosion.radius * 0.65);

    for (const city of this.cities) {
      if (city.alive && this._distance2D(city.position, explosion.position) <= damageRadius) {
        this._destroyCity(city);
      }
    }

    for (const base of this.bases) {
      if (base.alive && this._distance2D(base.position, explosion.position) <= damageRadius) {
        this._destroyBase(base);
      }
    }
  }

  _distance2D(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  _estimateSkyLuma(x, y, time) {
    const u = THREE.MathUtils.clamp((x - WORLD.left) / (WORLD.right - WORLD.left), 0, 1);
    const minY = WORLD.bottom - 20;
    const maxY = WORLD.top + 140;
    const v = THREE.MathUtils.clamp((y - minY) / (maxY - minY), 0, 1);

    const t = THREE.MathUtils.smoothstep(v, 0, 1);
    let r = THREE.MathUtils.lerp(0.01, 0.0, t);
    let g = THREE.MathUtils.lerp(0.08, 0.015, t);
    let b = THREE.MathUtils.lerp(0.2, 0.06, t);

    const drift = Math.sin((u * 5.5) + (time * 0.06)) * Math.sin((v * 7.0) - (time * 0.05));
    r += 0.00 * drift;
    g += 0.012 * drift;
    b += 0.03 * drift;

    r = THREE.MathUtils.clamp(r, 0, 1);
    g = THREE.MathUtils.clamp(g, 0, 1);
    b = THREE.MathUtils.clamp(b, 0, 1);

    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
  }

  _updateMissileContrast(missile, time) {
    const luma = this._estimateSkyLuma(missile.position.x, missile.position.y, time);
    const onBrightBg = THREE.MathUtils.smoothstep(luma, 0.36, 0.68);
    const onDarkBg = 1 - onBrightBg;
    const { palette } = missile;

    this._tmpColorA.setHex(palette.lightHead);
    this._tmpColorB.setHex(palette.darkHead);
    missile.headInner.material.color.copy(this._tmpColorA.lerp(this._tmpColorB, onBrightBg));

    this._tmpColorA.setHex(palette.lightTrail);
    this._tmpColorB.setHex(palette.darkTrail);
    missile.trailInner.material.color.copy(this._tmpColorA.lerp(this._tmpColorB, onBrightBg));

    this._tmpColorA.setHex(OUTLINE_COLORS.dark);
    this._tmpColorB.setHex(OUTLINE_COLORS.light);
    const outlineBlend = onDarkBg * 0.42;
    missile.headOuter.material.color.copy(this._tmpColorA.lerp(this._tmpColorB, outlineBlend));

    this._tmpColorA.setHex(OUTLINE_COLORS.dark);
    this._tmpColorB.setHex(0xc8e7ff);
    missile.trailOuter.material.color.copy(this._tmpColorA.lerp(this._tmpColorB, onDarkBg * 0.26));

    missile.headInner.material.opacity = THREE.MathUtils.lerp(0.94, 0.98, onBrightBg);
    missile.trailInner.material.opacity = THREE.MathUtils.lerp(0.9, 0.98, onBrightBg);
    missile.headOuter.material.opacity = THREE.MathUtils.lerp(0.72, 0.9, onBrightBg);
    missile.trailOuter.material.opacity = THREE.MathUtils.lerp(0.64, 0.86, onBrightBg);
  }

  _clearGroup(group) {
    for (const child of [...group.children]) {
      this._disposeObject3D(child);
    }
  }

  _disposeObject3D(object) {
    if (!object) {
      return;
    }

    object.traverse((node) => {
      if (node.geometry) {
        node.geometry.dispose();
      }
      if (node.material) {
        if (Array.isArray(node.material)) {
          for (const material of node.material) {
            material.dispose();
          }
        } else {
          node.material.dispose();
        }
      }
    });

    if (object.parent) {
      object.parent.remove(object);
    }
  }

  _updateEnemySpawning(delta) {
    if (this.waveTransition || !this.running) {
      return;
    }

    this.enemySpawnTimer -= delta;
    if (this.enemySpawned < this.enemyToSpawn && this.enemySpawnTimer <= 0) {
      this._spawnEnemyMissile();
      this.enemySpawned += 1;
      this.enemySpawnTimer = THREE.MathUtils.randFloat(this.spawnRate * 0.65, this.spawnRate * 1.35);
    }

    const waveResolved = this.enemySpawned >= this.enemyToSpawn
      && this.enemyMissiles.length === 0
      && this.playerMissiles.length === 0
      && this.explosions.length === 0;

    if (waveResolved) {
      this._completeWave();
    }
  }

  _updateEnemyMissiles(delta, time) {
    for (let i = this.enemyMissiles.length - 1; i >= 0; i -= 1) {
      const missile = this.enemyMissiles[i];

      missile.progress += (missile.speed * delta) / missile.distance;

      if (missile.canSplit && !missile.didSplit && missile.progress >= missile.splitAt) {
        missile.didSplit = true;
        this._spawnEnemyMissile(missile.position);
        this._spawnEnemyMissile(missile.position);
      }

      if (missile.progress >= 1) {
        missile.position.copy(missile.end);
        this._enemyMissileImpact(missile, i);
        continue;
      }

      missile.position.lerpVectors(missile.start, missile.end, missile.progress);
      this._updateMissileVisual(missile, time);
    }
  }

  _updatePlayerMissiles(delta, time) {
    for (let i = this.playerMissiles.length - 1; i >= 0; i -= 1) {
      const missile = this.playerMissiles[i];
      missile.progress += (missile.speed * delta) / missile.distance;

      if (missile.progress >= 1) {
        missile.position.copy(missile.end);
        this._disposeObject3D(missile.group);
        this.playerMissiles.splice(i, 1);
        this._spawnExplosion(missile.end, 'defense');
        continue;
      }

      missile.position.lerpVectors(missile.start, missile.end, missile.progress);
      this._updateMissileVisual(missile, time);
    }
  }

  _updateExplosions(delta) {
    for (let i = this.explosions.length - 1; i >= 0; i -= 1) {
      const explosion = this.explosions[i];

      if (!explosion.shrinking) {
        explosion.radius += explosion.growth * delta;
        if (explosion.radius >= explosion.maxRadius) {
          explosion.radius = explosion.maxRadius;
          explosion.shrinking = true;
        }
      } else {
        explosion.radius -= explosion.growth * delta * 0.72;
      }

      if (explosion.radius <= 0) {
        this._disposeObject3D(explosion.core);
        this._disposeObject3D(explosion.ring);
        this.explosions.splice(i, 1);
        continue;
      }

      const normalized = explosion.radius / explosion.maxRadius;
      explosion.core.scale.setScalar(Math.max(explosion.radius * 0.18, 0.1));
      explosion.ring.scale.setScalar(Math.max(explosion.radius, 0.1));

      explosion.core.material.opacity = Math.max(0, (1 - normalized) * 0.76);
      explosion.ring.material.opacity = Math.max(0, (1 - normalized) * 0.92);

      this._applyExplosionCollisions(explosion);
    }
  }

  _updateSparkBursts(delta) {
    for (let i = this.sparkBursts.length - 1; i >= 0; i -= 1) {
      const burst = this.sparkBursts[i];
      burst.life += delta;

      const ratio = burst.life / burst.maxLife;
      if (ratio >= 1) {
        this._disposeObject3D(burst.points);
        this.sparkBursts.splice(i, 1);
        continue;
      }

      const points = burst.points;
      const positions = points.geometry.attributes.position.array;

      for (let p = 0; p < positions.length; p += 3) {
        burst.velocities[p + 1] -= 80 * delta;

        positions[p + 0] += burst.velocities[p + 0] * delta;
        positions[p + 1] += burst.velocities[p + 1] * delta;
        positions[p + 2] += burst.velocities[p + 2] * delta;
      }

      points.geometry.attributes.position.needsUpdate = true;
      points.material.opacity = (1 - ratio) * 0.9;
      points.material.size = 2.4 + (1 - ratio) * 3.8;
    }
  }

  _updateEnvironment(time) {
    this.backdropMaterial.uniforms.time.value = time;
    this.stars.rotation.y = time * 0.01;
    this.groundGrid.material.opacity = 0.22 + (Math.sin(time * 1.2) * 0.08 + 0.08);

    this.pulseLightA.intensity = 0.9 + Math.sin(time * 1.8) * 0.24;
    this.pulseLightB.intensity = 1.0 + Math.cos(time * 1.45) * 0.22;
  }

  _startCutscene(bonus) {
    this.cutscene.active = true;
    this.cutscene.timer = 0;
    this.cutscene.bonus = bonus;
    this.cutscene.wave = this.wave;

    this.cutsceneGroup.visible = true;
    this.cutsceneCore.scale.setScalar(0.24);
    this.cutsceneRingA.scale.setScalar(0.52);
    this.cutsceneRingB.scale.setScalar(0.4);

    for (let i = 0; i < this.cutsceneBeams.length; i += 1) {
      this.cutsceneBeams[i].visible = this.cities[i]?.alive ?? false;
    }

    for (const city of this.cities) {
      if (city.alive) {
        this._spawnSparkBurst(city.position.clone().add(new THREE.Vector3(0, 30, 0)), 0x57f8ff, 30);
      }
    }

    if (this.stageBannerEl) {
      this.stageBannerEl.classList.remove('show');
      void this.stageBannerEl.offsetWidth;
      this.stageBannerEl.textContent = `Wave ${this.wave} Cleared +${bonus}`;
      this.stageBannerEl.classList.add('show');
    }

    this.audio.stageClear(this.wave, bonus);
  }

  _endCutscene(forceHideBanner = false) {
    if (!this.cutsceneGroup) {
      return;
    }

    this.cutscene.active = false;
    this.cutscene.timer = 0;
    this.cutsceneGroup.visible = false;
    this.bloomPass.strength = this.baseBloomStrength;
    this.renderer.toneMappingExposure = this.baseExposure;
    this.camera.position.copy(this.baseCameraPos);
    this.camera.lookAt(this.baseLookTarget);

    if (forceHideBanner && this.stageBannerEl) {
      this.stageBannerEl.classList.remove('show');
    }
  }

  _updateCutscene(delta, time) {
    if (!this.cutscene.active) {
      return;
    }

    this.cutscene.timer += delta;
    const p = THREE.MathUtils.clamp(this.cutscene.timer / this.cutscene.duration, 0, 1);
    const pulse = Math.sin(p * Math.PI);
    const fade = 1 - p;

    this.cutsceneCore.scale.setScalar(0.24 + (pulse * 2.1));
    this.cutsceneCore.material.opacity = 0.58 * Math.pow(fade, 0.7);

    this.cutsceneRingA.scale.setScalar(0.5 + (p * 9.5));
    this.cutsceneRingA.material.opacity = 0.86 * Math.pow(fade, 1.05);
    this.cutsceneRingA.rotation.z = time * 1.7;

    this.cutsceneRingB.scale.setScalar(0.4 + (p * 7.4));
    this.cutsceneRingB.material.opacity = 0.76 * Math.pow(fade, 1.15);
    this.cutsceneRingB.rotation.z = -time * 2.2;

    for (let i = 0; i < this.cutsceneBeams.length; i += 1) {
      const beam = this.cutsceneBeams[i];
      if (!beam.visible) {
        continue;
      }
      const flicker = 0.65 + (Math.sin((time * 14) + i) * 0.25);
      beam.material.opacity = Math.max(0, (1 - p * 1.35) * flicker);
      beam.scale.y = 0.7 + (pulse * 1.2);
    }

    const flashA = Math.exp(-Math.pow((p - 0.08) / 0.08, 2)) * 0.75;
    const flashB = Math.exp(-Math.pow((p - 0.42) / 0.12, 2)) * 0.32;
    this.cutsceneFlash.material.opacity = flashA + flashB;

    const bloomPulse = this.baseBloomStrength + (pulse * 0.82) + (Math.sin(time * 22) * 0.08 * fade);
    this.bloomPass.strength = bloomPulse;
    this.renderer.toneMappingExposure = this.baseExposure + (pulse * 0.17);

    const cameraKick = Math.sin(Math.min(p * 1.4, 1) * Math.PI);
    this.camera.position.set(
      this.baseCameraPos.x,
      this.baseCameraPos.y + (cameraKick * 20) - (p * 6),
      this.baseCameraPos.z - (cameraKick * 90),
    );
    this._tmpVecA.set(
      this.baseLookTarget.x,
      this.baseLookTarget.y + (cameraKick * 28),
      this.baseLookTarget.z,
    );
    this.camera.lookAt(this._tmpVecA);
  }

  animate() {
    const delta = Math.min(this.clock.getDelta(), 0.033);
    const time = this.clock.getElapsedTime();
    this.currentTime = time;

    this._updateEnvironment(time);
    this._updateCutscene(delta, time);

    if (this.running) {
      if (this.waveTransition) {
        this.waveTransitionTimer -= delta;
        if (this.waveTransitionTimer <= 0) {
          this._beginNextWave();
        }
      }

      this._updateEnemySpawning(delta);
      this._updateEnemyMissiles(delta, time);
      this._updatePlayerMissiles(delta, time);
      this._updateExplosions(delta);
      this._updateSparkBursts(delta);

      if (this._aliveCities().length === 0) {
        this._gameOver();
      }
    } else {
      this._updateSparkBursts(delta);
      this._updateExplosions(delta);
      this._updateEnemyMissiles(delta, time);
      this._updatePlayerMissiles(delta, time);
    }

    this.composer.render();
  }
}

new NeonMissileCommand();
