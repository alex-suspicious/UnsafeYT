(function() {
  const video = document.getElementsByClassName('video-stream')[0];
  const html5_video_container = document.getElementsByClassName('html5-video-container')[0];
  if (!video) {
    console.error('No video found with class "video-stream"');
    return;
  }
  video.crossOrigin = 'anonymous';

  const canvas = document.createElement('canvas');
  canvas.id = 'glcanvas';
  Object.assign(canvas.style, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translateY(-50%) translateX(-50%)',
    pointerEvents: 'none',
    zIndex: 9999
  });

  Object.assign(html5_video_container.style, {
    position: 'relative',
    height: '100%'
  });
  html5_video_container.appendChild(canvas);

  const gl = canvas.getContext('webgl', { alpha: false })
          || canvas.getContext('experimental-webgl', { alpha: false });
  if (!gl) {
    console.error('WebGL not supported');
    return;
  }

  function resizeCanvas() {
    canvas.width = video.offsetWidth;
    canvas.height = video.offsetHeight;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  setInterval(resizeCanvas, 2500);

  let vsSource = '';
  let fsSource = '';

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
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return null;
    }
    gl.useProgram(program);
    return program;
  }

  // Load shaders
  fetch(chrome.runtime.getURL('shaders/screen.vrt')).then(r => r.text()).then(vsText => {
    vsSource = vsText;
    return fetch(chrome.runtime.getURL('shaders/screen.frag'));
  }).then(r => r.text()).then(fsText => {
    fsSource = fsText;

    const program = createProgram(vsSource, fsSource);
    if (!program) return;

    // Attributes
    const posLoc   = gl.getAttribLocation(program, 'a_position');
    const texLoc   = gl.getAttribLocation(program, 'a_texCoord');

    // Uniforms
    const videoSamplerLoc   = gl.getUniformLocation(program, 'u_sampler');
    const shuffleSamplerLoc = gl.getUniformLocation(program, 'u_shuffle');

    // Quad setup
    const quadVerts = new Float32Array([
      -1, -1,  0, 0,
       1, -1,  1, 0,
      -1,  1,  0, 1,
      -1,  1,  0, 1,
       1, -1,  1, 0,
       1,  1,  1, 1
    ]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

    // Video texture
    const videoTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, videoTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // Shuffle texture
    const shuffleImage = new Image();
    shuffleImage.crossOrigin = 'anonymous';
    shuffleImage.src = chrome.runtime.getURL('textures/inv_offset_map.png');
    const shuffleTex = gl.createTexture();
    shuffleImage.onload = () => {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, shuffleTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, shuffleImage);
    };

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    function render() {
      if (video.readyState >= video.HAVE_CURRENT_DATA) {
        // Video texture unit 0
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, videoTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        gl.uniform1i(videoSamplerLoc, 0);

        // Shuffle texture unit 1
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, shuffleTex);
        gl.uniform1i(shuffleSamplerLoc, 1);

        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      requestAnimationFrame(render);
    }

    render();
    console.log('Decrypter with shuffle texture initialized');
  });
})();
