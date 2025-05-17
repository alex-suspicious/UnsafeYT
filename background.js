let activeCanvas = null;
let activeGl = null;
let activeAudioCtx = null;
let activeSrcNode = null;
let activeGainNode = null;
let activeOutputGainNode = null;
let activeNotchFilters = [];
let resizeIntervalId = null;
let renderFrameId = null;
let isRendering = false;
let originalVideoContainerStyle = null;
let resizeCanvasListener = null;

function deterministicHash(s, prime = 31, modulus = Math.pow(2, 32)) {
    let h = 0;
    modulus = Math.floor(modulus);
    for (let i = 0; i < s.length; i++) {
        const charCode = s.charCodeAt(i);
        h = (h * prime + charCode) % modulus;
        if (h < 0) {
            h += modulus;
        }
    }
    return h / modulus;
}

function _generateUnshuffleOffsetMapRawBytes(seedToken, width, height) {
    if (width <= 0 || height <= 0) {
        throw new Error("Width and height must be positive integers.");
    }
    if (typeof seedToken !== 'string' || seedToken.length === 0) {
        throw new Error("Seed string is required for deterministic generation.");
    }
    const totalPixels = width * height;
    const startHash = deterministicHash(seedToken, 31, Math.pow(2, 32) - 1);
    const stepSeed = seedToken + "_step";
    const stepHash = deterministicHash(stepSeed, 37, Math.pow(2, 32) - 2);
    const startAngle = startHash * Math.PI * 2.0;
    const angleIncrement = stepHash * Math.PI / Math.max(width, height);
    const indexedValues = [];
    for (let i = 0; i < totalPixels; i++) {
        const value = Math.sin(startAngle + i * angleIncrement);
        indexedValues.push({ value: value, index: i });
    }
    indexedValues.sort((a, b) => a.value - b.value);
    const pLinearized = new Array(totalPixels);
    for (let k = 0; k < totalPixels; k++) {
        const originalIndex = indexedValues[k].index;
        const shuffledIndex = k;
        pLinearized[originalIndex] = shuffledIndex;
    }
    const offsetMapBytes = new Uint8Array(totalPixels * 3);
    for (let oy = 0; oy < height; oy++) {
        for (let ox = 0; ox < width; ox++) {
            const originalLinearIndex = oy * width + ox;
            const shuffledLinearIndex = pLinearized[originalLinearIndex];
            const sy_shuffled = Math.floor(shuffledLinearIndex / width);
            const sx_shuffled = shuffledLinearIndex % width;
            const offsetX = (sx_shuffled - ox) / width;
            const offsetY = (sy_shuffled - oy) / height;
            const r_val = Math.max(0, Math.min(255, Math.trunc(((offsetX + 1.0) / 2.0) * 255.0)));
            const g_val = Math.max(0, Math.min(255, Math.trunc(((offsetY + 1.0) / 2.0) * 255.0)));
            const b_val = 0;
            const pixelIndex = (oy * width + ox) * 3;
            offsetMapBytes[pixelIndex] = r_val;
            offsetMapBytes[pixelIndex + 1] = g_val;
            offsetMapBytes[pixelIndex + 2] = b_val;
        }
    }
    return offsetMapBytes;
}

function generateUnshuffleOffsetMapDataURLFromSeed(seedToken, width, height) {
    if (width <= 0 || height <= 0) {
        throw new Error("Width and height must be positive integers.");
    }
    if (typeof seedToken !== 'string' || seedToken.length === 0) {
        throw new Error("Seed string is required.");
    }
    if (typeof document === 'undefined') {
        throw new Error("DOM environment not available. Cannot create canvas.");
    }
    const rawOffsetMapBytes = _generateUnshuffleOffsetMapRawBytes(seedToken, width, height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error("Could not get 2D rendering context for temporary canvas.");
    }
    const imageData = ctx.createImageData(width, height);
    const pixelData = imageData.data;
    let sourceByteIndex = 0;
    let destByteIndex = 0;
    const totalRgbBytes = width * height * 3;
    const totalRgbaBytes = width * height * 4;
    if (pixelData.length !== totalRgbaBytes) {
        console.error(`ImageData length mismatch. Expected ${totalRgbaBytes}, got ${pixelData.length}`);
        throw new Error("Internal error: ImageData buffer size mismatch.");
    }
    while (sourceByteIndex < totalRgbBytes) {
        pixelData[destByteIndex++] = rawOffsetMapBytes[sourceByteIndex++];
        pixelData[destByteIndex++] = rawOffsetMapBytes[sourceByteIndex++];
        pixelData[destByteIndex++] = rawOffsetMapBytes[sourceByteIndex++];
        pixelData[destByteIndex++] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    try {
        const dataUrl = canvas.toDataURL('image/png');
        return dataUrl;
    } catch (e) {
        console.error("Error during canvas.toDataURL:", e);
        throw new Error("Failed to get Data URL from canvas: " + e.message);
    }
}

function removeEffects() {
    if (activeCanvas) {
        activeCanvas.remove();
        activeCanvas = null;
    }
    if (resizeIntervalId !== null) {
        clearInterval(resizeIntervalId);
        resizeIntervalId = null;
    }
    if (renderFrameId !== null) {
        cancelAnimationFrame(renderFrameId);
        renderFrameId = null;
    }
    isRendering = false;

    if (resizeCanvasListener) {
        window.removeEventListener("resize", resizeCanvasListener);
        resizeCanvasListener = null;
    }

    if (activeGl) {
        const loseContext = activeGl.getExtension('WEBGL_lose_context');
        if (loseContext) {
            loseContext.loseContext();
        }
        activeGl = null;
    }

    const html5_video_container = document.getElementsByClassName("html5-video-container")[0];
    if (html5_video_container && originalVideoContainerStyle) {
        Object.assign(html5_video_container.style, originalVideoContainerStyle);
        originalVideoContainerStyle = null;
    }

    if (activeAudioCtx) {
        const video = document.querySelector(".video-stream");
        if (video && activeSrcNode) {
             try {
                 activeSrcNode.disconnect();
                 activeSrcNode.connect(activeAudioCtx.destination);
                 console.log("Reconnected video source directly to audio destination.");
             } catch (e) {
                 console.warn("Failed to disconnect/reconnect audio source:", e);
             }
        }

        if (activeGainNode) activeGainNode.disconnect();
        activeNotchFilters.forEach(filter => filter.disconnect());
        if (activeOutputGainNode) activeOutputGainNode.disconnect();

        activeSrcNode = null;
        activeGainNode = null;
        activeNotchFilters = [];
        activeOutputGainNode = null;

        activeAudioCtx.close().then(() => {
            console.log("AudioContext closed");
            activeAudioCtx = null;
        }).catch(e => {
            console.error("Error closing AudioContext:", e);
            activeAudioCtx = null;
        });
    }
    console.log("Removed applied effects.");
}

let currentToken = "";

function getToken() {
    const element = document.getElementsByClassName("yt-core-attributed-string--link-inherit-color")[0];
    if (!element || !element.textContent) {
        return "";
    }
    let text = element.textContent;
    let parts = text.split("token:");
    if (parts.length > 1) {
        parts = parts[1].split("\n");
        if (parts.length > 0) {
            return parts[0].trim();
        }
    }
    return "";
}

async function applyEffects(seedToken) {
    removeEffects();
    currentToken = seedToken;

    if (typeof currentToken !== 'string' || currentToken.length < 3) {
        console.log("Invalid or empty token. Effects will not be applied.");
        return;
    }
    console.log(`Applying effects with token: "${currentToken}"`);

    const video = document.getElementsByClassName("video-stream")[0];
    const html5_video_container = document.getElementsByClassName(
        "html5-video-container"
    )[0];
    if (!video) {
        console.error('No video found with class "video-stream"');
        return;
    }
    video.crossOrigin = "anonymous";

    activeCanvas = document.createElement("canvas");
    activeCanvas.id = "glcanvas";
    Object.assign(activeCanvas.style, {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translateY(-50%) translateX(-50%)",
        pointerEvents: "none",
        zIndex: 9999,
    });

    if (html5_video_container && !originalVideoContainerStyle) {
        originalVideoContainerStyle = {
             position: html5_video_container.style.position,
             height: html5_video_container.style.height,
        };
    }
    Object.assign(html5_video_container.style, {
        position: "relative",
        height: "100%",
    });
    html5_video_container.appendChild(activeCanvas);

    activeGl =
        activeCanvas.getContext("webgl", { alpha: false }) ||
        activeCanvas.getContext("experimental-webgl", { alpha: false });
    if (!activeGl) {
        console.error("WebGL not supported");
        removeEffects();
        return;
    }

    resizeCanvasListener = () => {
        if (!activeCanvas || !video) return;
        activeCanvas.width = video.offsetWidth;
        activeCanvas.height = video.offsetHeight;
        if (activeGl) {
             activeGl.viewport(0, 0, activeGl.drawingBufferWidth, activeGl.drawingBufferHeight);
        }
    };
    window.addEventListener("resize", resizeCanvasListener);
    resizeCanvasListener();
    resizeIntervalId = setInterval(resizeCanvasListener, 2500);

    const compileShader = (type, src) => {
        if (!activeGl) {
            console.error("GL context is null in compileShader.");
            return null;
        }
        const shader = activeGl.createShader(type);
        if (!shader) {
            console.error("Failed to create shader of type:", type);
            return null;
        }

        activeGl.shaderSource(shader, src);
        let error = activeGl.getError();
        if (error !== activeGl.NO_ERROR) {
            console.error("GL error after shaderSource:", error);
            activeGl.deleteShader(shader);
            return null;
        }

        activeGl.compileShader(shader);
        error = activeGl.getError();
        if (error !== activeGl.NO_ERROR) {
            console.error("GL error after compileShader:", error);
             // Get info log only if compilation failed
            if (!activeGl.getShaderParameter(shader, activeGl.COMPILE_STATUS)) {
                console.error("Shader info log:", activeGl.getShaderInfoLog(shader));
            }
            activeGl.deleteShader(shader);
            return null;
        }

        const compileStatus = activeGl.getShaderParameter(shader, activeGl.COMPILE_STATUS);

        if (!compileStatus) {
            console.error("Shader compilation error:", activeGl.getShaderInfoLog(shader));
            activeGl.deleteShader(shader);
            return null;
        }

        console.log(`Shader compiled successfully (Type: ${type === activeGl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT'})`);
        return shader;
    };

    const createProgram = (vsSrc, fsSrc) => {
        if (!activeGl) {
            console.error("GL context is null in createProgram.");
            return null;
        }
        const vs = compileShader(activeGl.VERTEX_SHADER, vsSrc);
        const fs = compileShader(activeGl.FRAGMENT_SHADER, fsSrc);
        if (!vs || !fs) {
            console.error("Failed to create vertex or fragment shader.");
            return null;
        }

        const program = activeGl.createProgram();
        activeGl.attachShader(program, vs);
        activeGl.attachShader(program, fs);
        activeGl.linkProgram(program);

        if (!activeGl.getProgramParameter(program, activeGl.LINK_STATUS)) {
            console.error("Program link error:", activeGl.getProgramInfoLog(program));
            activeGl.deleteProgram(program);
            activeGl.deleteShader(vs);
            activeGl.deleteShader(fs);
            return null;
        }

        activeGl.useProgram(program);
        console.log("WebGL program created and linked successfully.");

        activeGl.deleteShader(vs);
        activeGl.deleteShader(fs);

        return program;
    };

    try {
        const vsText = await fetch(chrome.runtime.getURL("shaders/screen.vrt")).then(r => r.text());
        const fsText = await fetch(chrome.runtime.getURL("shaders/screen.frag")).then(r => r.text());

        const program = createProgram(vsText, fsText);
        if (!program) {
            removeEffects();
            return;
        }

        const posLoc = activeGl.getAttribLocation(program, "a_position");
        const texLoc = activeGl.getAttribLocation(program, "a_texCoord");
        const videoSamplerLoc = activeGl.getUniformLocation(program, "u_sampler");
        const shuffleSamplerLoc = activeGl.getUniformLocation(program, "u_shuffle");

        const quadVerts = new Float32Array([
            -1, -1, 0, 0,
             1, -1, 1, 0,
            -1,  1, 0, 1,
            -1,  1, 0, 1,
             1, -1, 1, 0,
             1,  1, 1, 1,
        ]);

        const buf = activeGl.createBuffer();
        activeGl.bindBuffer(activeGl.ARRAY_BUFFER, buf);
        activeGl.bufferData(activeGl.ARRAY_BUFFER, quadVerts, activeGl.STATIC_DRAW);
        activeGl.enableVertexAttribArray(posLoc);
        activeGl.vertexAttribPointer(posLoc, 2, activeGl.FLOAT, false, 16, 0);
        activeGl.enableVertexAttribArray(texLoc);
        activeGl.vertexAttribPointer(texLoc, 2, activeGl.FLOAT, false, 16, 8);

        const videoTex = activeGl.createTexture();
        activeGl.bindTexture(activeGl.TEXTURE_2D, videoTex);
        activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_WRAP_S, activeGl.CLAMP_TO_EDGE);
        activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_WRAP_T, activeGl.CLAMP_TO_EDGE);
        activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_MIN_FILTER, activeGl.NEAREST);
        activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_MAG_FILTER, activeGl.NEAREST);

        const shuffleImage = new Image();
        shuffleImage.crossOrigin = "anonymous";
        const actualSeedToken = currentToken;
        const actualWidthFromPython = 80;
        const actualHeightFromPython = 80;

        try {
            const base64UnshuffleMap = generateUnshuffleOffsetMapDataURLFromSeed(
                actualSeedToken,
                actualWidthFromPython,
                actualHeightFromPython
            );
            shuffleImage.src = base64UnshuffleMap;
        } catch (error) {
            console.error("Error generating unshuffle offset map (from seed):", error);
            removeEffects();
            return;
        }

        const shuffleTex = activeGl.createTexture();
        shuffleImage.onload = () => {
             if (!activeGl) return;
            activeGl.activeTexture(activeGl.TEXTURE1);
            activeGl.bindTexture(activeGl.TEXTURE_2D, shuffleTex);
            activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_WRAP_S, activeGl.CLAMP_TO_EDGE);
            activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_WRAP_T, activeGl.CLAMP_TO_EDGE);
            activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_MIN_FILTER, activeGl.NEAREST);
            activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_MAG_FILTER, activeGl.NEAREST);
            activeGl.texImage2D(
                activeGl.TEXTURE_2D,
                0,
                activeGl.RGBA,
                activeGl.RGBA,
                activeGl.UNSIGNED_BYTE,
                shuffleImage
            );
             console.log("Shuffle texture loaded.");
        };
        shuffleImage.onerror = (e) => {
             console.error("Error loading shuffle image:", e);
             removeEffects();
        }

        activeGl.clearColor(0.0, 0.0, 0.0, 1.0);

        isRendering = true;
        const render = () => {
            if (!isRendering || !activeGl || !video || !activeCanvas) return;

            if (video.readyState >= video.HAVE_CURRENT_DATA) {
                activeGl.activeTexture(activeGl.TEXTURE0);
                activeGl.bindTexture(activeGl.TEXTURE_2D, videoTex);
                activeGl.texImage2D(
                    activeGl.TEXTURE_2D,
                    0,
                    activeGl.RGBA,
                    activeGl.RGBA,
                    activeGl.UNSIGNED_BYTE,
                    video
                );
                activeGl.uniform1i(videoSamplerLoc, 0);

                activeGl.activeTexture(activeGl.TEXTURE1);
                activeGl.bindTexture(activeGl.TEXTURE_2D, shuffleTex);
                activeGl.uniform1i(shuffleSamplerLoc, 1);

                activeGl.clear(activeGl.COLOR_BUFFER_BIT);
                activeGl.drawArrays(activeGl.TRIANGLES, 0, 6);
            }
            renderFrameId = requestAnimationFrame(render);
        };
        render();
        console.log("Video effects initialized with shuffle texture.");

    } catch (error) {
        console.error("Error during video effects setup:", error);
        removeEffects();
        return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
         console.error("AudioContext not supported");
    } else {
        activeAudioCtx = new AudioCtx();
        console.log("AudioContext created");

        const video = document.querySelector(".video-stream");
        if (video) {
            activeSrcNode = activeAudioCtx.createMediaElementSource(video);
            activeGainNode = activeAudioCtx.createGain();
            activeOutputGainNode = activeAudioCtx.createGain();

            activeGainNode.gain.value = 1.0;

            const defaultOutputGain = 100.0;
            activeOutputGainNode.gain.value = defaultOutputGain;
            console.log(
                `Output GainNode created with initial gain: ${defaultOutputGain}`
            );

            const filterFrequencies = [
                500, 450, 550, 6500, 6600, 6650, 10500, 10600, 10700,
            ];
            const filterEq = [1, 1, 1, 5, 5, 5, 5, 5, 5];
            const filterCut = [-180, -180, -180, -180, -180, -180, -180, -180, -180];
            const numFilters = filterFrequencies.length;

            activeNotchFilters = [];
            for (let i = 0; i < numFilters; i++) {
                const filter = activeAudioCtx.createBiquadFilter();
                filter.type = "notch";
                filter.frequency.value = filterFrequencies[i];
                filter.Q.value = filterEq[i];
                filter.gain.value = filterCut[i];
                activeNotchFilters.push(filter);
                console.log(
                    `Created BiquadFilterNode ${i + 1} (notch) at ${
                    filterFrequencies[i]
                    } Hz with Q=${filterEq[i]} and Gain=${filterCut[i]}dB`
                );
            }

            let currentNode = activeSrcNode;
            currentNode = currentNode.connect(activeGainNode);

            if (activeNotchFilters.length > 0) {
                currentNode = currentNode.connect(activeNotchFilters[0]);
                for (let i = 0; i < numFilters - 1; i++) {
                    currentNode = currentNode.connect(activeNotchFilters[i + 1]);
                }
                currentNode.connect(activeOutputGainNode);
            } else {
                currentNode.connect(activeOutputGainNode);
                console.warn("No notch filters created.");
            }

            activeOutputGainNode.connect(activeAudioCtx.destination);
            console.log("Audio graph connected.");

            const handleAudioState = async () => {
                 if (!activeAudioCtx || activeAudioCtx.state === 'closed') return;
                if (video.paused) {
                    if (activeAudioCtx.state === 'running') {
                         activeAudioCtx.suspend().catch(e => console.error("Error suspending AudioContext:", e));
                    }
                } else {
                    if (activeAudioCtx.state === 'suspended') {
                         activeAudioCtx.resume().catch(e => console.error("Error resuming AudioContext:", e));
                    }
                }
            };

            video.addEventListener("play", handleAudioState);
            video.addEventListener("pause", handleAudioState);

            if (!video.paused) {
                handleAudioState();
            }
        } else {
             console.error("Video element not found for audio effects.");
        }
        console.log("Audio effects initialized.");
    }
}

async function initializeScript() {
    await new Promise(r => setTimeout(r, 2000));
    let initialToken = getToken();
    console.log(`Initial token found: "${initialToken}"`);
    await applyEffects(initialToken);

    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) {
                         if (node.matches('.ytd-watch-metadata')) {
                             console.log('Detected .ytd-watch-metadata added.');
                             const newToken = getToken();
                             console.log(`New token found after update: "${newToken}"`);
                             applyEffects(newToken);
                         }
                         if (node.querySelector('.ytd-watch-metadata')) {
                             console.log('Detected .ytd-watch-metadata in added subtree.');
                             const newToken = getToken();
                             console.log(`New token found after update: "${newToken}"`);
                             applyEffects(newToken);
                         }
                    }
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log("MutationObserver started.");
}

initializeScript();