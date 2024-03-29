/**
 * @author Daniel Venable
 * 
 * This program lets you play a game where you try to solve a 3D maze
 */

import Maze, { NDimArray } from '../maze.js';
import * as THREE from 'https://cdn.skypack.dev/three@0.133.1';
import { PointerLockControls } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/controls/PointerLockControls';

class Game {
    keysDown = new Set();
    isTapping = false;
    renderer = new THREE.WebGLRenderer();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    material = new THREE.MeshLambertMaterial({ map: new THREE.TextureLoader().load('./wall.png') });
    winLight = new THREE.PointLight(0x0000ff, 15, 3, 2);
    clock;
    direction = new THREE.Vector3();
    dimensions = 0;
    gridDirection = {
        dim: null,
        sign: 0
    };
    gridPosition;
    motion = {
        offset: 0,
        dim: null,
        isStopped: false
    };
    /** @type MultiMazeWalls */ walls;
    started = false;
    won = false;
    controls;
    dontUnlock = false;
    settings = {
        WASDSpeed: 1000,
        touchSpeed: 8,
        moveSpeed: 3,
        fadeTime: 0.5
    }

    /** sets up the game */
    init() {
        // stops mouse events triggered by touch from moving the camera
        // this must be done before the mousemove event is attached to the controls
        document.addEventListener('pointermove', event => {
            if (event.pointerType === 'touch') {
                event.stopImmediatePropagation();
            }
        });

        this.controls = new PointerLockControls(this.camera, this.renderer.domElement);

        document.querySelector('#start').addEventListener('click', () => this.start());
        document.querySelector('#win button').addEventListener('click', () => {
            elems.win.hidden = true;
            this.showControls();
        });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        window.addEventListener('resize', () => {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
        });

        document.body.appendChild(this.renderer.domElement);

        this.renderer.render(this.scene, this.camera);

        document.addEventListener('keydown', e => this.keysDown.add(e.code));
        document.addEventListener('keyup', e => this.keysDown.delete(e.code));

        const light = new THREE.PointLight(0xffffff, 1.4, 10, 2);
        light.position.set(1, 1, 1);
        this.scene.add(this.camera);
        this.camera.add(light);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));

        const showXButton = () => {
            document.removeEventListener('touchstart', showXButton);
            const xbutton = document.querySelector('#xbutton');
            xbutton.classList.add('visible');
            xbutton.addEventListener('touchstart', event => {
                event.preventDefault(); // don't also click the link
                this.controls.unlock();
                this.showControls();
            });
        }

        document.addEventListener('touchstart', showXButton);

        elems.continue.addEventListener('click', () => this.hideControls());

        document.querySelector('#fourDbtn').addEventListener('click', function () {
            document.querySelectorAll('.fourD').forEach(a => a.hidden = false);
            this.hidden = true;
        });
    }

    /** starts or restarts the game */
    start() {
        const size = [...document.querySelectorAll(':not([hidden]) > input')]
            .map(({ value }) => Math.floor(value));
        if (!size.every(a => a > 0)) {
            alert('Please enter valid values');
            return;
        }

        this.dimensions = size.length;

        this.controls.lock();

        if (this.started) {
            this.scene.remove(this.getMesh());
            this.walls.dispose();
            this.won = false;
        } else {
            this.firstStart();
        }

        this.clock = new THREE.Clock();
        elems.time.textContent = '0:0';
        this.gridPosition = new Array(this.dimensions).fill(0);
        elems.pos.textContent = this.gridPosition.join(',');
        this.camera.position.set(0, 0, 0);
        this.camera.lookAt(1, 0, 1);

        this.walls = new MultiMazeWalls(new Maze(...size), this.material);

        this.scene.add(this.getMesh());
        this.winLight.position.set(...size.slice(0, 3).map(a => 4 * a - 4));
        this.walls.getMesh(this.walls.size.slice(3).map(a => a - 1)).add(this.winLight);

        for (const button of elems.fourDMoveBtns) {
            // ">=" instead of ">" because dimension numbers are 0 based
            button.hidden = button.dataset.dim >= this.dimensions;
        }

        this.enter();
    }

    /** does setup right before the game starts for the first time */
    firstStart() {
        this.started = true;
        document.querySelector('#data').hidden = false;
        if (elems.xbutton.classList.contains('visible')) {
            elems.continue.hidden = false;
        }

        this.controls.addEventListener('lock', () => {
            this.hideControls();
        });

        this.controls.addEventListener('unlock', () => {
            // when controls.lock() is called, and it fails to lock, then this event is
            // erroneously triggered as soon as there is a touchstart event,
            // so it does nothing when dontUnlock is true
            if (!this.dontUnlock) {
                this.showControls();
            }
        });

        this.renderer.domElement.addEventListener('pointerdown', event => {
            if (event.pointerType === 'mouse') {
                if (this.controls.isLocked) {
                    this.controls.unlock();
                } else {
                    this.controls.lock();
                }
            }
        });

        this.enableTouch();
        this.enable4DControls();
        this.loop();
    }

    /** enables you to control it with a touchscreen */
    enableTouch() {
        if (!window.TouchEvent) {
            return;
        }

        const prevX = new Map,
            prevY = new Map;
        
        const taps = new Map;

        this.renderer.domElement.addEventListener('touchstart', event => {
            for (const { identifier, clientX, clientY } of event.touches) {
                prevX.set(identifier, clientX);
                prevY.set(identifier, clientY);

                taps.set(identifier, this.clock.getElapsedTime());
            }

            this.dontUnlock = true;
            setTimeout(() => this.dontUnlock = false, 0);
        });

        document.addEventListener('touchmove', event => {
            for (const { identifier, clientX, clientY } of event.touches) {
                if (prevX.has(identifier)) {
                    const deltaX = (clientX - prevX.get(identifier)) * this.settings.touchSpeed;
                    const deltaY = (clientY - prevY.get(identifier)) * this.settings.touchSpeed;
                    this.moveCamera(deltaX, deltaY);
                }

                prevX.set(identifier, clientX);
                prevY.set(identifier, clientY);
                taps.delete(identifier); // if you move your finger it doesn't count as a tap
            }
        });

        const onTouchEnd = event => {
            for (const { identifier } of event.changedTouches) {
                prevX.delete(identifier);
                prevY.delete(identifier);

                if (this.clock.getElapsedTime() - taps.get(identifier) < 0.5) {
                    this.isTapping = true;
                }
                taps.delete(identifier);
            }
        }

        document.addEventListener('touchend', onTouchEnd);
        document.addEventListener('touchcancel', onTouchEnd);
    }

    /** checks if the space key is held down */
    get isSpaceDown() {
        return this.keysDown.has('Space');
    }

    /** rotates the camera */
    moveCamera(movementX, movementY) {
        // tricks the PointerLockControls into thinking controls
        // are locked so the onMouseMove function doesn't immediatly return
        const lockedBefore = this.controls.isLocked;
        this.controls.isLocked = true;

        const event = new MouseEvent('mousemove', {
            movementX, movementY
        });

        document.dispatchEvent(event);

        // restore the controls to its original state
        this.controls.isLocked = lockedBefore;
    }

    updateDirection() {
        this.controls.getDirection(this.direction);
        const arr = [...this.direction];
        let highestDir, highestSize = 0;
        for (let i = 0; i < 3; i++) {
            if (Math.abs(arr[i]) > Math.abs(highestSize)) {
                highestSize = arr[i];
                highestDir = i;
            }
        }
        this.gridDirection.dim = highestDir;
        this.gridDirection.sign = Math.sign(highestSize);
    }

    loop() {
        requestAnimationFrame(() => {
            this.updatePosition();
            this.renderer.render(this.scene, this.camera);
            this.loop();
        });
    }

    updatePosition(onlyIfMoving = true) {
        const delta = this.clock.getDelta(),
            mins = Math.floor(this.clock.elapsedTime / 60),
            secs = Math.floor(this.clock.elapsedTime % 60);
        elems.time.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

        this.WASDTurn(delta);
        Sparkles.update();

        if (onlyIfMoving) {
            if (!this.isSpaceDown && !this.isTapping) return;

            this.updateDirection();

            if (this.motion.offset === 0) {
                if (this.isWall()) return;
                this.motion.dim = this.gridDirection.dim;
            }

            if (this.gridDirection.dim === this.motion.dim) {
                this.move(this.gridDirection.sign * delta * this.settings.moveSpeed);
            } else {
                this.move(-Math.sign(this.motion.offset) * delta * this.settings.moveSpeed);
            }
        }

        const pos = this.gridPosition.map(
            (value, index) => value * 4 + (index === this.motion.dim ? this.motion.offset : 0));

        elems.pos.textContent = this.gridPosition;
        this.camera.position.fromArray(pos);

        if (!this.won && this.gridPosition.every(
                (value, index) => this.walls.size[index] === value + 1)) {
            elems.win.hidden = false;
            elems.size.textContent = this.walls.size.join('x');
            elems.totalTime.textContent =
                `${mins} minute${mins === 1 ? '' : 's'} and ${secs} second${secs === 1 ? '' : 's'}`;
            this.won = true;
            this.controls.unlock();
        }
    }

    /** lets you move through the 4th dimension by pressing Q and E keys */
    enable4DControls() {
        document.addEventListener('keydown', event => {
            if (event.code === 'KeyE') {
                this.hyperMove(1, 3);
            } else if (event.code === 'KeyQ') {
                this.hyperMove(-1, 3);
            }
        });

        this.renderer.domElement.addEventListener('animationend', function() {
            this.classList.remove('fade');
        });

        document.querySelector('#fourD-move-btn').addEventListener('click', ({ target }) => {
            this.hyperMove(target.dataset.sign, target.dataset.dim);
        });
    }

    /** move through a higher dimension */
    hyperMove(sign, dim) {
        if (3 <= dim && dim < this.dimensions &&
                Math.abs(this.motion.offset) < 1 &&
                !this.isWall({ sign, dim })) {

            this.exit();

            const gridPosition = [...this.gridPosition];
            gridPosition[dim] += Math.sign(sign);

            this.renderer.domElement.classList.add('fade');

            setTimeout(() => {
                this.scene.remove(this.getMesh());
                this.gridPosition = gridPosition;
                this.motion.offset = 0;
                this.scene.add(this.getMesh());
                this.enter();      
                this.updatePosition(false);
            }, this.settings.fadeTime * 50);
        }
    }

    /** gets the mesh for the current position in higher dimensions */
    getMesh() {
        return this.walls.getMesh(this.gridPosition.slice(3));
    }

    /** turns the camera if WASD are held down */
    WASDTurn(delta) {
        const dist = this.settings.WASDSpeed * delta;
        if (this.keysDown.has('KeyW')) {
            this.moveCamera(0, -dist);
        }
        if (this.keysDown.has('KeyA')) {
            this.moveCamera(-dist, 0);
        }
        if (this.keysDown.has('KeyS')) {
            this.moveCamera(0, dist);
        }
        if (this.keysDown.has('KeyD')) {
            this.moveCamera(dist, 0);
        }
    }

    /** move forward a certain distance */
    move(distance) {
        if (Math.abs(this.motion.offset) <= 1 && Math.abs(this.motion.offset + distance) > 1) {
            this.exit();
        }

        if (Math.abs(this.motion.offset) > 1 && Math.abs(this.motion.offset + distance) <= 1) {
            this.enter();
        }

        const before = Math.sign(this.motion.offset);
        this.motion.offset += distance;

        if (before * Math.sign(this.motion.offset) === -1) {
            this.stopIfShould(distance);
        }

        while (this.motion.offset < -2) {
            this.motion.offset += 4;
            this.gridPosition[this.motion.dim]--;
            if (this.motion.offset < 0) {
                this.stopIfShould(distance);
            }
        }
        while (this.motion.offset > 2) {
            this.motion.offset -= 4;
            this.gridPosition[this.motion.dim]++;
            if (this.motion.offset > 0) {
                this.stopIfShould(distance);
            }
        }
    }

    stopIfShould(distance) {
        if (this.motion.dim !== this.gridDirection.dim ||
                this.isTapping ||
                this.isWall({ sign: Math.sign(distance), dim: this.motion.dim })) {
            this.motion.offset = 0;
            this.isTapping = false;
        }
    }

    isWall({ sign, dim } = this.gridDirection) {
        if (dim >= this.dimensions) {
            return true;
        }
        const pos = [...this.gridPosition];
        if (sign < 0) pos[dim]--;
        return [-1, this.walls.size[dim] - 1].includes(pos[dim]) ||
            this.walls.walls[dim].getElement(pos);
    }

    /** update 4d buttons when you enter an area */
    enter() {
        for (const button of elems.fourDMoveBtns) {
            if (!this.isWall(button.dataset)) {
                button.hidden = false;
                button.classList.add('show');
            }
        }
    }

    /** update 4d buttons when you exit an area */
    exit() {
        for (const button of elems.fourDMoveBtns) {
            if (!this.isWall(button.dataset)) {
                button.classList.remove('show');
            }
        }
    }

    showControls() { 
        elems.controls.hidden = false;
        elems.xbutton.hidden = true;
    }

    hideControls() {
        elems.controls.hidden = true;
        elems.xbutton.hidden = false;
    }
}

const elems = {
    controls:  document.querySelector('#controls'),
    pos:       document.querySelector('#pos'),
    time:      document.querySelector('#time'),
    win:       document.querySelector('#win'),
    size:      document.querySelector('#size'),
    totalTime: document.querySelector('#total-time'),
    xbutton:   document.querySelector('#xbutton'),
    continue:  document.querySelector('#continue'),
    fourDMoveBtns: document.querySelector('#fourD-move-btn').children
};

class MultiMazeWalls {
    /** @param { Maze } maze */
    constructor(maze, material) {
        this.walls = maze.walls();
        this.size = maze.lengths;

        const mazeWallses = new NDimArray(this.size.slice(3), () => new MazeWalls());

        for (let dimension = 0; dimension < 3; dimension++) {
            const otherDims = [0, 1, 2].filter(a => a !== dimension);

            this.walls[dimension].doOnIndicieses((indicies, isWall) => {
                const pos = indicies.slice(0, 3).map(a => 4 * a);
                const mazeWalls = mazeWallses.getElement(indicies.slice(3));
                pos[dimension] += 2; // so the wall is in the gap between spaces
                if (isWall) {
                    mazeWalls.createFaces(pos, dimension, true);
                } else {
                    for (const d of otherDims) {
                        mazeWalls.createFaces(pos, d, false);
                    }
                }
            });

            mazeWallses.doOnValues(walls => walls.fillEdge(this.size, dimension, otherDims));
        }

        this.geometries = mazeWallses.mapAll(walls => walls.toGeometry());
        this.sections = this.geometries.mapAll(g => new Section(g, material));

        for (let dimension = 3; dimension < maze.dimensions; dimension++) {
            /** @todo add lights or something where you can move through higher dimensions */
            this.walls[dimension].doOnIndicieses((indicies, isWall) => {
                if (!isWall) {
                    this.sections
                        .getElement(indicies.slice(3))
                        .createPortal(dimension, true, indicies.slice(0, 3));
                    indicies[dimension]++;
                    this.sections
                        .getElement(indicies.slice(3))
                        .createPortal(dimension, false, indicies.slice(0, 3));
                }
            });
        }
    }

    /** gets a mesh object */
    getMesh(coords) {
        return this.sections.getElement(coords).mesh;
    }

    /** disposes the geometry objects */
    dispose() {
        this.geometries.doOnValues(g => g.dispose());
    }
}

/** A 3D cross-section of the maze */
class Section {
    #portals = [];

    constructor(geometry, material) {
        this.mesh = new THREE.Mesh(geometry, material);
    }

    /** creates a visual effect that shows you can move through a higher dimension */
    createPortal(dimension, isForward, coords) {
        const portal = new Sparkles(Section.#color(dimension, isForward));
        portal.position.set(...coords.map(a => 4 * a));
        this.#portals.push(portal);
        this.mesh.add(portal);
    }

    static #colors = [
        [0xff0000],
        [0x00ff00]
    ];

    static #color(dimension, isForward) {
        return Section.#colors[+isForward][dimension - 3];
    }
}

/** A sparkle effect. */
class Sparkles extends THREE.Points {
    constructor(color) {
        if (Sparkles.#geometries.has(color)) {
            super(Sparkles.#geometries.get(color), Sparkles.#materials.get(color));
        } else {
            const geometry = new THREE.BufferGeometry();
            const positions = [];
            for (let i = 0; i < Sparkles.numberOfParticles * 3; i++) {
                positions.push(Math.random() * 2 - 1);
            }

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            Sparkles.#geometries.set(color, geometry);

            const material = new THREE.PointsMaterial({
                size: 0.02,
                color,
                blending: THREE.AdditiveBlending,
                transparent: true,
                opacity: 0.3
            });

            Sparkles.#materials.set(color, material);

            super(geometry, material);
        }
    }
    
    static numberOfParticles = 100;
    static #geometries = new Map();
    static #materials = new Map();

    /** Updates the animation, changing the position of the particles. */
    static update() {
        for (const [, geometry] of this.#geometries) {
            const positions = geometry.attributes.position.array;
            for (let i = 0; i < positions.length; i++) {
                positions[i] += (Math.random() - 0.5) / 100;
                if (positions[i] > 1) {
                    positions[i] = 1;
                } else if (positions[i] < -1) {
                    positions[i] = -1;
                }
            }
            geometry.attributes.position.needsUpdate = true;
        }
    }
}

class MazeWalls {
    positions = [];
    normals = [];
    uvs = [];

    createFace([x, y, z], direction, isFront, isFacingOut) {
        const mod = isFacingOut ? 1 : -1;
        if (isFront) {
            switch (direction) {
                case 0:
                    this.positions.push(
                        x + mod, y - 1, z + 1,
                        x + mod, y - 1, z - 1,
                        x + mod, y + 1, z + 1,
                        x + mod, y + 1, z + 1,
                        x + mod, y - 1, z - 1,
                        x + mod, y + 1, z - 1
                    );
                    break;
                case 1:
                    this.positions.push(
                        x + 1, y + mod, z - 1,
                        x - 1, y + mod, z - 1,
                        x + 1, y + mod, z + 1,
                        x + 1, y + mod, z + 1,
                        x - 1, y + mod, z - 1,
                        x - 1, y + mod, z + 1
                    );
                    break;
                case 2:
                    this.positions.push(
                        x - 1, y - 1, z + mod,
                        x + 1, y - 1, z + mod,
                        x - 1, y + 1, z + mod,
                        x - 1, y + 1, z + mod,
                        x + 1, y - 1, z + mod,
                        x + 1, y + 1, z + mod
                    );
            }
        } else {
            switch (direction) {
                case 0:
                    this.positions.push(
                        x - mod, y - 1, z - 1,
                        x - mod, y - 1, z + 1,
                        x - mod, y + 1, z - 1,
                        x - mod, y + 1, z - 1,
                        x - mod, y - 1, z + 1,
                        x - mod, y + 1, z + 1
                    );
                    break;
                case 1:
                    this.positions.push(
                        x + 1, y - mod, z + 1,
                        x - 1, y - mod, z + 1,
                        x + 1, y - mod, z - 1,
                        x + 1, y - mod, z - 1,
                        x - 1, y - mod, z + 1,
                        x - 1, y - mod, z - 1
                    );
                    break;
                case 2:
                    this.positions.push(
                        x + 1, y - 1, z - mod,
                        x - 1, y - 1, z - mod,
                        x + 1, y + 1, z - mod,
                        x + 1, y + 1, z - mod,
                        x - 1, y - 1, z - mod,
                        x - 1, y + 1, z - mod
                    );
            }
        }
        const normalArray = [0, 0, 0];
        normalArray[direction] = isFront ? 1 : -1;
        for (let i = 0; i < 6; i++) this.normals.push(...normalArray);
        this.uvs.push(...MazeWalls.#uvArray);
    }

    /** create 2 faces, one in each direction */
    createFaces(pos, direction, isFacingOut) {
        this.createFace(pos, direction, true, isFacingOut);
        this.createFace(pos, direction, false, isFacingOut);
    }

    /** fill the outside edge of the maze */
    fillEdge(size, dimension, otherDims) {
        for (const x of [-2, size[dimension] * 4 - 2]) {
            for (let y = 0; y <= size[otherDims[0]] * 4 - 4; y += 2) {
                for (let z = 0; z <= size[otherDims[1]] * 4 - 4; z += 2) {
                    const arr = [];
                    arr[dimension] = x;
                    arr[otherDims[0]] = y;
                    arr[otherDims[1]] = z;
                    this.createFace(arr, dimension, x === -2, true);
                }
            }
        }
    }

    /** converts it to a BufferGeometry */
    toGeometry() {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.positions), 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.normals), 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uvs), 2));
        return geometry;
    }

    static #uvArray = [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1];
}

new Game().init();