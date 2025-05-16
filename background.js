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


var isExtensionOn = true;

function getToken() {
  let parts = document
    .getElementsByClassName("yt-core-attributed-string--link-inherit-color")[0]
    .textContent.split("token:");
  if (parts.length > 1) {
    parts = parts[1].split("\n");
    if (parts.length > 1) return parts[0];
  }

  return "0";
}

(function () {
  const video = document.getElementsByClassName("video-stream")[0];
  const html5_video_container = document.getElementsByClassName(
    "html5-video-container"
  )[0];
  if (!video) {
    console.error('No video found with class "video-stream"');
    return;
  }
  video.crossOrigin = "anonymous";

  const canvas = document.createElement("canvas");
  canvas.id = "glcanvas";
  Object.assign(canvas.style, {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translateY(-50%) translateX(-50%)",
    pointerEvents: "none",
    zIndex: 9999,
  });

  Object.assign(html5_video_container.style, {
    position: "relative",
    height: "100%",
  });
  html5_video_container.appendChild(canvas);

  const gl =
    canvas.getContext("webgl", { alpha: false }) ||
    canvas.getContext("experimental-webgl", { alpha: false });
  if (!gl) {
    console.error("WebGL not supported");
    return;
  }

  function resizeCanvas() {
    canvas.width = video.offsetWidth;
    canvas.height = video.offsetHeight;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  setInterval(resizeCanvas, 2500);

  let vsSource = "";
  let fsSource = "";

  function compileShader(type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(vsSrc, fsSrc) {
    const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      return null;
    }
    gl.useProgram(program);
    return program;
  }

  
  fetch(chrome.runtime.getURL("shaders/screen.vrt"))
    .then((r) => r.text())
    .then((vsText) => {
      vsSource = vsText;
      return fetch(chrome.runtime.getURL("shaders/screen.frag"));
    })
    .then((r) => r.text())
    .then((fsText) => {
      fsSource = fsText;

      const program = createProgram(vsSource, fsSource);
      if (!program) return;

      const posLoc = gl.getAttribLocation(program, "a_position");
      const texLoc = gl.getAttribLocation(program, "a_texCoord");

      const videoSamplerLoc = gl.getUniformLocation(program, "u_sampler");
      const shuffleSamplerLoc = gl.getUniformLocation(program, "u_shuffle");

      const quadVerts = new Float32Array([
        -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, -1, 1, 0, 1, 1, -1, 1, 0, 1, 1,
        1, 1,
      ]);
      
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(texLoc);
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);
      
      const videoTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, videoTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

      const shuffleImage = new Image();
      shuffleImage.crossOrigin = "anonymous";
      
      const actualSeedTokenFromPython = getToken();
      console.log("Video token:" + actualSeedTokenFromPython);
      
      const actualWidthFromPython = 80;
      const actualHeightFromPython = 80;
      
      try {
        const base64UnshuffleMap = generateUnshuffleOffsetMapDataURLFromSeed(
            actualSeedTokenFromPython,
            actualWidthFromPython,
            actualHeightFromPython
        );
        
        shuffleImage.src = base64UnshuffleMap;
        console.log("Generated Base64 Unshuffle Offset Map (from seed):");
        console.log(base64UnshuffleMap);
      
      } catch (error) {
        console.error("Error generating unshuffle offset map (from seed):", error);
      }

      const shuffleTex = gl.createTexture();
      shuffleImage.onload = () => {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, shuffleTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          shuffleImage
        );
      };

      gl.clearColor(0.0, 0.0, 0.0, 1.0);

      function render() {
        if (video.readyState >= video.HAVE_CURRENT_DATA) {
          
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, videoTex);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            video
          );
          gl.uniform1i(videoSamplerLoc, 0);

          
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, shuffleTex);
          gl.uniform1i(shuffleSamplerLoc, 1);

          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        requestAnimationFrame(render);
      }

      render();
      console.log("Decrypter with shuffle texture initialized");
    });
})();

(async () => {
  const video = document.querySelector(".video-stream");
  if (!video) {
    console.error('Video element with class "video-stream" not found.');
    return;
  }

  const vol = document.querySelector(".ytp-volume-area");
  if (vol) {
    vol.style.display = "none";
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;
  const filterFrequencies = [
    500, 450, 550, 6500, 6600, 6650, 10500, 10600, 10700,
  ];
  const filterEq = [1, 1, 1, 5, 5, 5, 5, 5, 5];
  const filterCut = [-180, -180, -180, -180, -180, -180, -180, -180, -180];

  const numFilters = filterFrequencies.length;

  const defaultQ = 1.0;
  const defaultOutputGain = 100.0;

  let srcNode = null;
  let gainNode = null;

  let notchFilters = [];
  let outputGainNode = null;

  async function initAudioGraph() {
    if (!audioCtx) {
      audioCtx = new AudioCtx();
      console.log("AudioContext created");
    }

    if (srcNode) {
      console.log("Audio graph already initialized.");
      return;
    }

    srcNode = audioCtx.createMediaElementSource(video);
    gainNode = audioCtx.createGain();
    outputGainNode = audioCtx.createGain();
    gainNode.gain.value = 1.0;

    outputGainNode.gain.value = defaultOutputGain;
    console.log(
      `Output GainNode created with initial gain: ${defaultOutputGain}`
    );

    notchFilters = [];
    for (let i = 0; i < numFilters; i++) {
      const filter = audioCtx.createBiquadFilter();
      filter.type = "notch";
      filter.frequency.value = filterFrequencies[i];
      filter.Q.value = filterEq[i]; 
      filter.gain.value = filterCut[i]; 
      
      notchFilters.push(filter);
      console.log(
        `Created BiquadFilterNode ${i + 1} (notch) at ${
          filterFrequencies[i]
        } Hz with Q=${defaultQ}`
      );
    }

    let currentNode = srcNode;
    currentNode = currentNode.connect(gainNode);

    if (notchFilters.length > 0) {
      currentNode = currentNode.connect(notchFilters[0]);

      for (let i = 0; i < numFilters - 1; i++) {
        currentNode = currentNode.connect(notchFilters[i + 1]);
      }

      currentNode.connect(outputGainNode);
    } else {
      currentNode.connect(outputGainNode);
      console.warn("No notch filters created.");
    }

    outputGainNode.connect(audioCtx.destination);

    console.log("Audio graph connected.");
  }

  video.addEventListener("play", async () => {
    await initAudioGraph();
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().then(() => {
        console.log("AudioContext resumed on video play");
      });
    }
  });

  if (!video.paused && audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().then(() => {
      console.log("AudioContext resumed because video was already playing");
    });
  }

  console.log(
    "Script loaded. Waiting for video playback to initialize audio graph."
  );
})();
