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
let currentNode = null;
let currentUrl = window.location.href;
let currentToken = "";
let savedDescription = "";

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

function _generateUnshuffleOffsetMapFloat32Array(seedToken, width, height) {
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
  
    const offsetMapFloats = new Float32Array(totalPixels * 2);
  
    for (let oy = 0; oy < height; oy++) {
        for (let ox = 0; ox < width; ox++) {
            const originalLinearIndex = oy * width + ox;
            const shuffledLinearIndex = pLinearized[originalLinearIndex];
  
            const sy_shuffled = Math.floor(shuffledLinearIndex / width);
            const sx_shuffled = shuffledLinearIndex % width;
  
            const offsetX = (sx_shuffled - ox) / width;
            const offsetY = (sy_shuffled - oy) / height;
  
            const pixelDataIndex = (oy * width + ox) * 2;
            offsetMapFloats[pixelDataIndex] = offsetX;
            offsetMapFloats[pixelDataIndex + 1] = offsetY;
        }
    }
    return offsetMapFloats;
}

function removeEffects() {
    if( !isRendering )
        return;

    isRendering = false;
    currentToken = "";

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
            activeSrcNode.disconnect();
            activeSrcNode = null;
        }

        if (activeGainNode) {
            activeGainNode.disconnect();
            activeGainNode = null;
        }
        activeNotchFilters.forEach(filter => {
            filter.disconnect();
        });
        activeNotchFilters = [];
        if (activeOutputGainNode) {
            activeOutputGainNode.disconnect();
            activeOutputGainNode = null;
        }
        
        activeAudioCtx.close().then(() => {
            console.log("AudioContext closed.");
            activeAudioCtx = null;
            if (video) {
                const currentSrc = video.src;
                video.src = '';
                video.load();
                video.src = currentSrc;
                video.load();
                console.log("Video source reloaded to restore audio.");
            }
        }).catch(e => console.error("Error closing AudioContext:", e));
        currentNode = null;
    }
    console.log("Removed applied effects.");
}


async function getToken( steps ) {
    await new Promise(r => setTimeout(r, 200));
    let description = $(".yt-core-attributed-string--link-inherit-color")[0];
    //console.log(savedDescription);

    if( typeof description != 'undefined' && description.innerHTML.includes("token:") && savedDescription != description.innerHTML ){
        let parts = description.innerHTML.split("token:");
        if (parts.length > 1) {
            parts = parts[1].split("\n");
            if (parts.length > 0 && currentToken != parts[0].trim()) {
                savedDescription = description.innerHTML;
                return parts[0].trim();
            }
        }

        return await getToken( steps-1 );
    }

    if( typeof description != 'undefined' && savedDescription != description.innerHTML && description.innerHTML.length > 5 && !description.innerHTML.includes("token:") ){
        savedDescription = description.innerHTML;
        return "";
    }

    if( steps > 0 )
        return await getToken( steps-1 );
    
    savedDescription = description.innerHTML;
    currentToken = "";
    return "";
}

async function applyEffects(seedToken) {
    if( isRendering )
        return;

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
        "touch-action": "none"
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
        activeCanvas.getContext("webgl2", { alpha: false }) ||
        activeCanvas.getContext("webgl", { alpha: false });
    if (!activeGl) {
        console.error("WebGL not supported");
        removeEffects();
        return;
    }

    let oesTextureFloatExt = null;
    if (activeGl instanceof WebGLRenderingContext) {
        oesTextureFloatExt = activeGl.getExtension('OES_texture_float');
        if (!oesTextureFloatExt) {
            console.warn('OES_texture_float extension not available. Float textures for shuffle map might not work.');
        }
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

        //console.log(`Shader compiled successfully (Type: ${type === activeGl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT'})`);
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
        //console.log("WebGL program created and linked successfully.");

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
        activeGl.vertexAttribPointer(posLoc, 2, activeGl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0);
        activeGl.enableVertexAttribArray(texLoc);
        activeGl.vertexAttribPointer(texLoc, 2, activeGl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 2 * Float32Array.BYTES_PER_ELEMENT);

        const videoTex = activeGl.createTexture();
        activeGl.bindTexture(activeGl.TEXTURE_2D, videoTex);
        activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_WRAP_S, activeGl.CLAMP_TO_EDGE);
        activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_T, activeGl.CLAMP_TO_EDGE);
        activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_MIN_FILTER, activeGl.NEAREST);
        activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_MAG_FILTER, activeGl.NEAREST);

        let actualSeedToken = currentToken;
        let actualWidthFromPython = 80;
        let actualHeightFromPython = 80;
        let unshuffleMapFloats = null;

        try {
            unshuffleMapFloats = _generateUnshuffleOffsetMapFloat32Array(
                actualSeedToken,
                actualWidthFromPython,
                actualHeightFromPython
            );
        } catch (error) {
            console.error("Error generating unshuffle offset map (from seed):", error);
            removeEffects();
            return;
        }

        const shuffleTex = activeGl.createTexture();

        activeGl.activeTexture(activeGl.TEXTURE1);
        activeGl.bindTexture(activeGl.TEXTURE_2D, shuffleTex);

        activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_WRAP_S, activeGl.CLAMP_TO_EDGE);
        activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_WRAP_T, activeGl.CLAMP_TO_EDGE);
        activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_MIN_FILTER, activeGl.NEAREST);
        activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_MAG_FILTER, activeGl.NEAREST);

        if (activeGl instanceof WebGL2RenderingContext) {
            activeGl.texImage2D(
                activeGl.TEXTURE_2D,
                0,
                activeGl.RG32F,
                actualWidthFromPython,
                actualHeightFromPython,
                0,
                activeGl.RG,
                activeGl.FLOAT,
                unshuffleMapFloats
            );
            //console.log("Uploaded shuffle map as RG32F texture (WebGL2)");
        } else if (oesTextureFloatExt) {
            const paddedData = new Float32Array(actualWidthFromPython * actualHeightFromPython * 4);
            for (let i = 0; i < unshuffleMapFloats.length / 2; i++) {
                paddedData[i * 4 + 0] = unshuffleMapFloats[i * 2 + 0];
                paddedData[i * 4 + 1] = unshuffleMapFloats[i * 2 + 1];
                paddedData[i * 4 + 2] = 0.0;
                paddedData[i * 4 + 3] = 1.0;
            }

            activeGl.texImage2D(
                activeGl.TEXTURE_2D,
                0,
                activeGl.RGBA,
                actualWidthFromPython,
                actualHeightFromPython,
                0,
                activeGl.RGBA,
                activeGl.FLOAT,
                paddedData
            );
            //console.log("Uploaded shuffle map as RGBA float texture (WebGL1)");
        } else {
            console.error("Float textures not supported by this browser's WebGL1 context.");
            return;
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
        //console.log("Video effects initialized with shuffle texture.");

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
        //console.log("AudioContext created");

        const video = document.querySelector(".video-stream");
        if (video) {
            activeSrcNode = activeAudioCtx.createMediaElementSource(video);
            
            const splitter = activeAudioCtx.createChannelSplitter(2);

            const leftGain = activeAudioCtx.createGain();
            const rightGain = activeAudioCtx.createGain();
            leftGain.gain.value = 0.5;
            rightGain.gain.value = 0.5;

            const merger = activeAudioCtx.createChannelMerger(1);

            activeOutputGainNode = activeAudioCtx.createGain();

            const defaultOutputGain = 100.0;
            activeOutputGainNode.gain.value = defaultOutputGain;
            //console.log(
            //    `Output GainNode created with initial gain: ${defaultOutputGain}`
            //);

            const filterFrequencies = [
                200, 440, 6600, 15600, 5000, 6000, 6300, 8000, 10000, 12500, 14000, 15000, 15500, 15900, 16000
            ];

            const filterEq = [3, 2, 1, 1, 20, 20, 5, 40, 40, 40, 40, 40, 1, 1, 40];
            const filterCut = [1, 1, 0,0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1];

            const numFilters = filterFrequencies.length;

            activeNotchFilters = [];

            for (let i = 0; i < numFilters; i++) {
                const filter = activeAudioCtx.createBiquadFilter();
                filter.type = "notch";
                filter.frequency.value = filterFrequencies[i];
                filter.Q.value = filterEq[i]*3.5;
                filter.gain.value = filterCut[i];
                activeNotchFilters.push(filter);
                //console.log(
                //    `Created BiquadFilterNode ${i + 1} (notch) at ${
                //    filterFrequencies[i]
                //    } Hz with Q=${filterEq[i]} and Gain=${filterCut[i]}dB`
                //);
            }

            activeSrcNode.connect(splitter);
            //console.log("Source connected to ChannelSplitterNode.");

            splitter.connect(leftGain, 0);
            splitter.connect(rightGain, 1);

            leftGain.connect(merger, 0, 0);
            rightGain.connect(merger, 0, 0);
            //nsole.log("Channels split, gained, and merged to mono.");

            currentNode = merger;

            activeGainNode = activeAudioCtx.createGain();
            activeGainNode.gain.value = 1.0;
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
            //console.log("Audio graph connected.");

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
        //console.log("Audio effects initialized.");
    }

}

async function initializeScript() {
    //await new Promise(r => setTimeout(r, 1000));
    removeEffects();

    //let ytDesc = await getYtDescription(50);
    let initialToken = await getToken(20);

    console.log("TOKEN: " + initialToken);

    if( initialToken == "" )
        return;

    console.log(`Initial token found: "${initialToken}"`);
    await applyEffects(initialToken);
}

console.log("Trying to initialize");

async function urlChanged() {
    console.log('URL change detected!');

    await initializeScript();
}

setInterval(async () => {
    var toCheck = location.href.split("&")[0].split("#")[0];

    if (toCheck !== currentUrl) {
        currentUrl = toCheck;
        await urlChanged();
    }
}, 500);

initializeScript();