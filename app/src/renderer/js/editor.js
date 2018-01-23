import {remote, ipcRenderer} from 'electron';
import aspectRatio from 'aspectratio';
import moment from 'moment';

// Note: `./` == `/app/dist/renderer/views`, not `js`
import {handleKeyDown, validateNumericInput} from '../js/input-utils';
import {handleTrafficLightsClicks, $, handleActiveButtonGroup, getTimestampAtEvent} from '../js/utils';
import {init as initErrorReporter} from '../../common/reporter';

const {app} = remote;
const {getShareServices} = remote.require('./plugins').default;
const TRIMMER_STEP = 0.00001;

initErrorReporter();

document.addEventListener('DOMContentLoaded', () => {
  const playBtn = $('.js-play-video');
  const pauseBtn = $('.js-pause-video');
  const maximizeBtn = $('.js-maximize-video');
  const unmaximizeBtn = $('.js-unmaximize-video');
  const muteBtn = $('.js-mute-video');
  const unmuteBtn = $('.js-unmute-video');
  const previewTime = $('.js-video-time');
  const previewTimeTip = $('.js-video-time-tip');
  const inputHeight = $('.input-height');
  const inputWidth = $('.input-width');
  const fps15Btn = $('#fps-15');
  const fpsMaxBtn = $('#fps-max');
  const preview = $('#preview');
  const previewContainer = $('.video-preview');
  const progressBar = $('progress');
  const windowHeader = $('.window-header');
  const trimmerIn = $('#trimmer-in');
  const trimmerOut = $('#trimmer-out');
  const trimLine = $('.timeline-markers');

  let maxFps = app.kap.settings.get('fps');
  maxFps = maxFps > 30 ? 30 : maxFps;
  let fps = 15;

  let lastValidInputWidth;
  let lastValidInputHeight;
  let aspectRatioBaseValues;
  let currentPreviewDuration;

  handleTrafficLightsClicks({hide: true});
  handleActiveButtonGroup({buttonGroup: fps15Btn.parentNode});

  fpsMaxBtn.children[0].innerText = maxFps;

  preview.oncanplay = function () {
    aspectRatioBaseValues = [this.videoWidth, this.videoHeight];
    [inputWidth.value, inputHeight.value] = aspectRatioBaseValues;
    [lastValidInputWidth, lastValidInputHeight] = aspectRatioBaseValues;

    currentPreviewDuration = preview.duration;
    progressBar.max = preview.duration;
    setInterval(() => {
      const inValue = getTrimmerValue(trimmerIn);
      const outValue = getTrimmerValue(trimmerOut);
      if (preview.currentTime < inValue || preview.currentTime > outValue) {
        preview.currentTime = inValue;
      }
      progressBar.value = preview.currentTime;
      previewTime.innerText = `${moment().startOf('day').seconds(preview.currentTime).format('m:ss')}`;
    }, 1);

    initializeTrimmers();
    // Remove the listener since it's called
    // every time the video loops
    preview.oncanplay = undefined;
  };

  pauseBtn.onclick = pause;

  playBtn.onclick = play;

  trimLine.addEventListener('click', skip);
  trimLine.addEventListener('mousemove', hover);

  function pause() {
    pauseBtn.classList.add('hidden');
    playBtn.classList.remove('hidden');
    preview.pause();
    ipcRenderer.send('toggle-play', false);
  }

  function play() {
    playBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    preview.play();
    ipcRenderer.send('toggle-play', true);
  }

  function hover(event) {
    if (preview.duration) {
      const timeAtEvent = getTimestampAtEvent(event, preview.duration);
      previewTimeTip.style.left = `${event.pageX}px`;
      previewTimeTip.textContent = `${moment().startOf('day').milliseconds(timeAtEvent * 1000).format('m:ss.SS')} (${moment().startOf('day').milliseconds(currentPreviewDuration * 1000).format('m:ss.SS')})`;
    }
  }

  function skip(event) {
    const timeAtEvent = getTimestampAtEvent(event, preview.duration);

    // Check that the time is between the trimmed timeline
    if (getTrimmerValue(trimmerIn) < timeAtEvent && timeAtEvent < getTrimmerValue(trimmerOut)) {
      preview.currentTime = timeAtEvent;
    }
  }

  function getTrimmedVideoDuration() {
    const inValue = getTrimmerValue(trimmerIn);
    const outValue = getTrimmerValue(trimmerOut);
    currentPreviewDuration = outValue - inValue;
    return currentPreviewDuration;
  }

  maximizeBtn.onclick = function () {
    this.classList.add('hidden');
    unmaximizeBtn.classList.remove('hidden');
    ipcRenderer.send('toggle-fullscreen-editor-window');
    $('body').classList.add('fullscreen');
  };

  unmaximizeBtn.onclick = function () {
    this.classList.add('hidden');
    maximizeBtn.classList.remove('hidden');
    ipcRenderer.send('toggle-fullscreen-editor-window');
    $('body').classList.remove('fullscreen');
  };

  muteBtn.onclick = () => {
    unmuteBtn.classList.remove('hidden');
    muteBtn.classList.add('hidden');
    preview.muted = true;
  };

  unmuteBtn.onclick = () => {
    unmuteBtn.classList.add('hidden');
    muteBtn.classList.remove('hidden');
    preview.muted = false;
  };

  function shake(el) {
    el.classList.add('shake');

    el.addEventListener('webkitAnimationEnd', () => {
      el.classList.remove('shake');
    });

    return true;
  }

  inputWidth.oninput = function () {
    this.value = validateNumericInput(this, {
      lastValidValue: lastValidInputWidth,
      empty: true,
      max: preview.videoWidth,
      min: 1,
      onInvalid: shake
    });

    const tmp = aspectRatio.resize(...aspectRatioBaseValues, this.value);
    if (tmp[1]) {
      lastValidInputHeight = tmp[1];
      inputHeight.value = tmp[1];
    }

    lastValidInputWidth = this.value || lastValidInputWidth;
  };

  inputWidth.onkeydown = handleKeyDown;

  inputWidth.onblur = function () {
    this.value = this.value || (shake(this) && lastValidInputWidth); // Prevent the input from staying empty
  };

  inputHeight.oninput = function () {
    this.value = validateNumericInput(this, {
      lastValidValue: lastValidInputHeight,
      empty: true,
      max: preview.videoHeight,
      min: 1,
      onInvalid: shake
    });

    const tmp = aspectRatio.resize(...aspectRatioBaseValues, undefined, this.value);
    if (tmp[0]) {
      lastValidInputWidth = tmp[0];
      inputWidth.value = tmp[0];
    }

    lastValidInputHeight = this.value || lastValidInputHeight;
  };

  inputHeight.onkeydown = handleKeyDown;

  inputHeight.onblur = function () {
    this.value = this.value || (shake(this) && lastValidInputHeight); // Prevent the input from staying empty
  };

  fps15Btn.onclick = function () {
    this.classList.add('active');
    fpsMaxBtn.classList.remove('active');
    fps = 15;
  };

  fpsMaxBtn.onclick = function () {
    this.classList.add('active');
    fps15Btn.classList.remove('active');
    fps = maxFps;
  };

  window.onkeyup = event => {
    if (event.key === 'Escape') {
      if (maximizeBtn.classList.contains('hidden')) {
        // Exit fullscreen
        unmaximizeBtn.onclick();
      } else {
        ipcRenderer.send('close-editor-window');
      }
    }

    if (event.key === ' ') {
      if (playBtn.classList.contains('hidden')) {
        pause();
      } else {
        play();
      }
    }
  };

  const shareServices = getShareServices();
  console.log('Share services', shareServices);

  function handleFile(service, format) {
    service.run({
      format,
      filePath: preview.src,
      width: inputWidth.value,
      height: inputHeight.value,
      fps,
      loop: true,
      startTime: getTrimmerValue(trimmerIn),
      endTime: getTrimmerValue(trimmerOut)
    });
  }

  function registerExportOptions() {
    // Use select elements to get initial list of export formats, even if we won't use the select down the line
    const exportFormats = document.querySelectorAll('.output-format .c-select');

    ipcRenderer.on('toggle-format-buttons', (event, data) => {
      for (const btn of exportFormats) {
        btn.disabled = !data.enabled;
      }
    });

    for (const formatElement of exportFormats) {
      const format = formatElement.dataset.exportType;
      const dropdown = formatElement.querySelector('select');
      const formatButton = document.querySelector(`.output-format button[data-export-type='${format}']`);

      let i = 0;
      for (const service of shareServices) {
        if (service.formats.includes(format)) {
          const option = document.createElement('option');
          option.text = service.title;
          option.value = i;
          dropdown.appendChild(option);
        }

        i++;
      }

      formatElement.appendChild(dropdown);

      // If there are more than the label and default export format, show the select
      // Else show a button instead of a dropdown that handles only "save to file"
      if (dropdown.children.length > 2) {
        // Prevent the dropdown from triggering the button
        dropdown.onclick = event => {
          event.stopPropagation();
        };

        dropdown.onchange = () => { // eslint-disable-line no-loop-func
          const service = shareServices[dropdown.value];
          handleFile(service, format);
          dropdown.value = '-1';
        };
      } else {
        const service = shareServices[0];
        formatElement.classList.add('hidden');
        formatButton.classList.remove('hidden');

        formatButton.onclick = () => handleFile(service, format);
      }
    }
  }

  registerExportOptions();

  ipcRenderer.on('run-plugin', (e, pluginName, format) => {
    const service = shareServices.find(service => service.pluginName === pluginName);
    handleFile(service, format);
  });

  ipcRenderer.on('video-src', (event, src) => {
    preview.src = src;
  });

  ipcRenderer.on('toggle-play', (event, status) => {
    if (status) {
      play();
      return;
    }

    pause();
  });

  previewContainer.onmouseover = function () {
    windowHeader.classList.remove('is-hidden');
  };

  previewContainer.onmouseout = function (event) {
    if (!Array.from(windowHeader.querySelectorAll('*')).includes(event.relatedTarget)) {
      windowHeader.classList.add('is-hidden');
    }
  };

  function initializeTrimmers() {
    trimmerIn.max = String(preview.duration);
    trimmerOut.max = String(preview.duration);
    trimmerOut.value = String(preview.duration);
    setTrimmerValue(trimmerIn, 0);

    trimmerIn.oninput = () => {
      handleTrimmerInput(trimmerIn.id);
      getTrimmedVideoDuration();
    };
    trimmerOut.oninput = () => {
      handleTrimmerInput(trimmerOut.id);
      getTrimmedVideoDuration();
    };
    trimmerIn.onchange = play;
    trimmerOut.onchange = play;
  }

  function getTrimmerValue(trimmerEl) {
    return parseFloat(trimmerEl.value);
  }

  function setTrimmerValue(trimmerEl, value) {
    trimmerEl.value = String(value);
  }

  function handleTrimmerInput(inputId) {
    pause();
    const inValue = getTrimmerValue(trimmerIn);
    const outValue = getTrimmerValue(trimmerOut);
    let currentFrame = inValue;
    if (inputId === trimmerOut.id) {
      currentFrame = outValue;
    }
    if (inValue >= outValue) {
      switch (inputId) {
        case trimmerIn.id:
          setTrimmerValue(trimmerOut, inValue + TRIMMER_STEP);
          break;
        case trimmerOut.id:
          setTrimmerValue(trimmerIn, outValue - TRIMMER_STEP);
          break;
        default:
          break;
      }
    }
    preview.currentTime = currentFrame;
  }
});

document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());
