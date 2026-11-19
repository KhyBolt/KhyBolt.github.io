(() => {
  'use strict';
  const id = (name) => document.getElementById(name);
  const data = window.DOPPLER_CASE;
  if (!data || data.events.length !== 2) {
    id('data-error').hidden = false;
    return;
  }
  const set = (name, text) => { id(name).textContent = text; };
  const formatTime = (seconds) => {
    const whole = Math.floor(seconds);
    return String(Math.floor(whole / 60)).padStart(2, '0') + ':' + String(whole % 60).padStart(2, '0');
  };
  const eventTime = (seconds) => formatTime(seconds) + (seconds % 1 ? (seconds % 1).toFixed(2).slice(1) : '');
  const signed = (value) => value === 0 ? '0' : (value < 0 ? '−' : '+') + Math.abs(value);
  const coordinates = (xy) => '(' + xy.map((v) => signed(v)).join(', ') + ') m';
  const svg = (tag, attrs = {}, text) => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, value));
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const audio = id('audio');
  const play = id('play');
  const eventButtons = [];
  let accumulated = 0;
  const clips = data.events.map((event) => {
    const clip = {offset:accumulated, length:event.end - event.start};
    accumulated += clip.length;
    return clip;
  });
  let activeClip = null;
  let pendingSeek = null;
  let playToken = 0;
  let tick = 0;
  const syncTime = (mediaTime) => {
    const clip = clips[activeClip];
    const position = clip ? data.events[activeClip].start + Math.min(clip.length, Math.max(0, mediaTime - clip.offset)) : 0;
    const formatted = formatTime(position);
    if (id('elapsed').textContent !== formatted) set('elapsed', formatted);
    id('playhead').style.left = (100 * position / data.duration) + '%';
  };
  const syncPlayback = () => {
    const playing = !audio.paused && !audio.ended;
    play.classList.toggle('is-playing', playing);
    play.setAttribute('aria-label', playing ? 'Pause current excerpt' : 'Play current excerpt');
    eventButtons.forEach(({button, icon, index}) => {
      const isClipPlaying = playing && activeClip === index;
      button.classList.toggle('is-playing', isClipPlaying);
      button.setAttribute('aria-label', (isClipPlaying ? 'Pause' : 'Play') + ' flyover ' + (index + 1) + ' excerpt');
      icon.textContent = isClipPlaying ? 'Ⅱ' : '▶';
    });
  };
  const setPosition = (value) => {
    syncTime(value);
    if (audio.readyState > 0) audio.currentTime = value;
    else pendingSeek = value;
  };
  const stopClipIfNeeded = () => {
    const clip = clips[activeClip];
    if (!audio.paused && clip && audio.currentTime >= clip.offset + clip.length) {
      audio.pause();
      setPosition(clip.offset + clip.length);
    }
  };
  const onFrame = () => {
    syncTime(pendingSeek ?? audio.currentTime);
    stopClipIfNeeded();
    if (!audio.paused && !audio.ended && !document.hidden) tick = requestAnimationFrame(onFrame);
  };
  const reportAudioError = () => {
    set('audio-feedback', 'Playback is unavailable in this browser. Use the original WAV link under The evidence.');
    id('audio-feedback').hidden = false;
    syncPlayback();
  };
  const start = () => {
    id('audio-feedback').hidden = true;
    const token = ++playToken;
    audio.play().catch((error) => {
      if (playToken === token && error.name !== 'AbortError') reportAudioError();
    });
  };
  const pause = () => { ++playToken; audio.pause(); };
  audio.addEventListener('loadedmetadata', () => {
    if (pendingSeek !== null) {
      const value = pendingSeek;
      pendingSeek = null;
      setPosition(value);
    }
    syncTime(audio.currentTime);
  });
  const refresh = () => {
    cancelAnimationFrame(tick);
    syncPlayback();
    onFrame();
  };
  audio.addEventListener('play', refresh);
  audio.addEventListener('pause', refresh);
  audio.addEventListener('ended', refresh);
  audio.addEventListener('timeupdate', () => { syncTime(pendingSeek ?? audio.currentTime); stopClipIfNeeded(); });
  audio.addEventListener('error', reportAudioError);
  document.addEventListener('visibilitychange', refresh);
  const startExcerpt = (index, restart = false) => {
    const clip = clips[index];
    const time = pendingSeek ?? audio.currentTime;
    const resume = !restart && activeClip === index && time >= clip.offset && time < clip.offset + clip.length;
    activeClip = index;
    if (!resume) setPosition(clip.offset);
    syncPlayback();
    start();
  };
  play.addEventListener('click', () => {
    if (!audio.paused) { pause(); return; }
    startExcerpt(activeClip ?? 0);
  });
  set('duration', formatTime(data.duration));
  syncTime(0);

  const timeline = id('timeline');
  timeline.append(svg('path', {d:'M0 54H1000', stroke:'#31483e', 'stroke-width':1}));
  const columnWidth = 1000 / data.wave.length;
  const bars = data.wave.map((v, idx) => {
    const center = (idx + .5) * columnWidth;
    const height = Math.min(45, v * .45);
    return 'M' + center.toFixed(2) + ' ' + (54 - height).toFixed(2) + 'v' + (2 * height).toFixed(2);
  }).join('');
  timeline.append(svg('path', {d:bars, stroke:'#58796a', 'stroke-width':Math.min(2, columnWidth * .62)}));
  data.events.forEach((e) => {
    const x = 1000 * e.start / data.duration;
    const w = 1000 * (e.end - e.start) / data.duration;
    timeline.append(svg('rect', {x, y:0, width:w, height:108, fill:'#8cddba', 'fill-opacity':.22}));
    timeline.append(svg('path', {d:'M' + x + ' 0v108M' + (x + w) + ' 0v108', stroke:'#94e0be', 'stroke-width':1.5}));
  });
  [0, .25, .5, .75, 1].forEach((fraction) => {
    const span = document.createElement('span');
    span.textContent = formatTime(data.duration * fraction);
    id('time-ticks').append(span);
  });

  const pitchFigure = (event) => {
    const w = 500, h = 112, p = {x:55, y:8, w:435, h:96};
    const [min, max] = event.frequency;
    const graph = svg('svg', {viewBox:'0 0 ' + w + ' ' + h, class:'event-image', 'aria-hidden':'true'});
    graph.append(svg('image', {href:'./assets/' + event.image, x:p.x, y:p.y, width:p.w, height:p.h, preserveAspectRatio:'none'}));
    [min, (min + max) / 2, max].forEach((f) => {
      const y = p.y + p.h * (max - f) / (max - min);
      graph.append(svg('path', {d:'M' + p.x + ' ' + y + 'h' + p.w, stroke:'#b0ccb8', 'stroke-opacity':.23}));
      graph.append(svg('text', {x:p.x - 8, y:y + 3, 'text-anchor':'end', fill:'#9fb8ac', 'font-family':'monospace', 'font-size':13}, f + ' Hz'));
    });
    const line = event.trace.map(([t, f]) => [
      (p.x + p.w * (t - event.start) / (event.end - event.start)).toFixed(1),
      (p.y + p.h * (max - f) / (max - min)).toFixed(1),
    ].join(',')).join(' ');
    graph.append(svg('polyline', {points:line, fill:'none', stroke:'#101c17', 'stroke-width':4}));
    graph.append(svg('polyline', {points:line, fill:'none', stroke:'#a4f4cf', 'stroke-width':1.7}));
    return graph;
  };
  data.events.forEach((event, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'event';
    button.setAttribute('aria-describedby', 'event-details-' + index);
    button.innerHTML = '<span class="event-top"><span class="event-label"><span class="event-icon" aria-hidden="true">▶</span><span></span></span><span class="event-drop"></span></span><span class="event-bottom" aria-hidden="true"><span></span><span></span></span><span class="sr-only"></span>';
    const icon = button.querySelector('.event-icon');
    button.querySelector('.event-label > span:last-child').textContent = 'Flyover 0' + (index + 1);
    button.querySelector('.event-drop').textContent = '↓ ' + event.drop.toFixed(1) + ' Hz';
    const bottom = button.querySelector('.event-bottom');
    bottom.firstElementChild.textContent = eventTime(event.start);
    bottom.lastElementChild.textContent = eventTime(event.end);
    const details = button.querySelector('.sr-only');
    details.id = 'event-details-' + index;
    details.textContent = 'From ' + eventTime(event.start) + ' to ' + eventTime(event.end) + ', the measured pitch falls by about ' + event.drop.toFixed(1) + ' hertz.';
    bottom.before(pitchFigure(event));
    button.addEventListener('click', () => {
      if (!audio.paused && activeClip === index) { pause(); return; }
      startExcerpt(index, !audio.paused);
    });
    eventButtons.push({button, icon, index});
    id('events').append(button);
  });
  syncPlayback();

  const map = id('map');
  const search = data.search;
  const controls = {survey: id('survey-view'), detail: id('detail-view'), truth: id('truth-toggle')};
  const show = id('reveal');
  const plot = {x:54, y:19, size:374};
  let view = 'survey';
  let revealed = false;
  let truth = false;
  const colors = [[157, 237, 182], [99, 189, 153], [49, 129, 116], [30, 81, 74], [20, 47, 44]];
  function fitColor(value) {
    const pos = Math.max(0, Math.min(3.9999, value * (colors.length - 1)));
    const a = colors[Math.floor(pos)], b = colors[Math.floor(pos) + 1];
    return 'rgb(' + a.map((channel, i) => Math.round(channel + (b[i] - channel) * (pos % 1))).join(',') + ')';
  }
  const grids = {};
  Object.entries({survey:data.survey, detail:data.detail}).forEach(([key, config]) => {
    const {bounds, spacing, grid} = config;
    const [x1,x2,y1,y2] = bounds;
    const x = (m) => plot.x + plot.size * (m - x1) / (x2 - x1);
    const y = (m) => plot.y + plot.size * (y2 - m) / (y2 - y1);
    const logs = grid.map((r) => Math.log10(r[2] + .001)).sort((a,b) => a-b);
    const low = logs[0], high = logs[Math.floor((logs.length - 1) * .92)];
    const heat = svg('g', {'clip-path':'url(#map-clip)'});
    const cellW = plot.size * spacing / (x2 - x1);
    const cellH = plot.size * spacing / (y2 - y1);
    grid.forEach(([a,b,loss]) => {
      const fill = fitColor((Math.log10(loss + .001) - low) / Math.max(.001, high - low));
      heat.append(svg('rect', {x:x(a) - cellW / 2, y:y(b) - cellH / 2, width:cellW + .15, height:cellH + .15, fill}));
    });
    grids[key] = {bounds, spacing, x, y, heat};
  });

  function marker(x, y, kind) {
    const c = kind === 'truth' ? '#f2c795' : '#f1fff7';
    const group = svg('g', {transform:'translate(' + x + ' ' + y + ')', 'aria-hidden':'true'});
    if (kind === 'truth') {
      group.append(svg('path', {d:'M0 -6 L6 0 0 6 -6 0 Z', stroke:'#0b1110', 'stroke-width':5, 'paint-order':'stroke', fill:c}));
    } else {
      group.append(svg('circle', {r:6, fill:'#0b1110', stroke:c, 'stroke-width':2}));
      group.append(svg('circle', {r:1.7, fill:c}));
    }
    return group;
  }

  function drawMap() {
    const {bounds, spacing, x, y, heat} = grids[view];
    const [x1,x2,y1,y2] = bounds;
    const title = svg('title',{id:'map-title'}, 'Synthetic receiver search, ' + (view === 'detail' ? 'zoomed fit' : 'full survey'));
    const description = svg('desc',{id:'map-description'}, !revealed ? 'Blank local-coordinate grid before revealing the search.' :
      'Colored samples show fit error. Estimated position ' + coordinates(search.estimate) + '.' +
      (truth ? ' True position ' + coordinates(search.truth) + '.' : ''));
    const defs = svg('defs');
    const clip = svg('clipPath',{id:'map-clip'});
    clip.append(svg('rect',{x:plot.x, y:plot.y, width:plot.size, height:plot.size}));
    defs.append(clip);
    map.replaceChildren(title, description, defs);
    map.append(svg('rect',{x:plot.x, y:plot.y, width:plot.size, height:plot.size, fill:'#101b17'}));
    if (revealed) map.append(heat);
    const rule = (d) => svg('path',{d, stroke:revealed ? '#d6ffe2' : '#9ac5ac', 'stroke-opacity':revealed ? '.23' : '.14', 'stroke-width':1});
    const label = (xs, ys, content, anchor='middle', size=11) => svg('text',
      {x:xs, y:ys, fill:'#aac1b2', 'font-size':size, 'text-anchor':anchor}, content);
    const km = view === 'survey';
    const d = km ? 2500 : (x2 - x1) / 4;
    const textScale = (m) => signed(km ? m / 1000 : m);
    for (let i=0;i<=4;i+=1) {
      const a=x1+d*i, b=y1+(y2-y1)*i/4;
      map.append(rule('M' + x(a) + ' ' + y(y2) + 'V' + y(y1)), rule('M' + x(x1) + ' ' + y(b) + 'H' + x(x2)));
      map.append(label(x(a), y(y1)+18, textScale(a)), label(x(x1)-8, y(b)+4, textScale(b), 'end'));
    }
    map.append(label(plot.x + plot.size/2, 437, 'East (' + (km ? 'km' : 'm') + ')'),
      label(plot.x, 11, 'North (' + (km ? 'km' : 'm') + ')', 'start'));
    if (revealed) {
      if (truth) {
        map.append(svg('path',{
          d:'M'+x(search.estimate[0])+' '+y(search.estimate[1])+' L'+x(search.truth[0])+' '+y(search.truth[1]),
          'stroke-width':1,'stroke':'#f2c795',
        }));
      }
      map.append(marker(x(search.estimate[0]),y(search.estimate[1]),'estimate'));
      if (truth) map.append(marker(x(search.truth[0]),y(search.truth[1]),'truth'));
    }
    set('map-sampling', revealed ? spacing + ' m samples' : 'Local coordinates, not a real map');
    id('score-legend').hidden = !revealed;
    id('pin-legend').hidden = !revealed;
    id('truth-legend').hidden = !truth;
  }
  const updateMap = () => {
    controls.survey.disabled = !revealed;
    controls.detail.disabled = !revealed;
    controls.truth.disabled = !revealed;
    controls.survey.setAttribute('aria-pressed', String(view === 'survey'));
    controls.detail.setAttribute('aria-pressed', String(view === 'detail'));
    controls.truth.setAttribute('aria-pressed', String(truth));
    controls.truth.textContent = truth ? 'Hide true location' : 'Show true location';
    show.setAttribute('aria-expanded', String(revealed));
    show.firstChild.nodeValue = revealed ? 'Hide saved search ' : 'Reveal saved search ';
    id('result-data').hidden = !revealed;
    id('truth-copy').hidden = !truth;
    drawMap();
  };
  controls.survey.addEventListener('click', () => { view = 'survey'; updateMap(); });
  controls.detail.addEventListener('click', () => { view = 'detail'; updateMap(); });
  controls.truth.addEventListener('click', () => {
    truth = !truth;
    if (truth) view = 'detail';
    updateMap();
    set('announcer', truth ? id('truth-copy').textContent + ' Zoomed to the fit.' : 'True location hidden.');
  });
  show.addEventListener('click', () => {
    revealed = !revealed;
    if (!revealed) { truth = false; view = 'survey'; }
    updateMap();
    set('announcer', revealed ? 'Saved search revealed. Estimated receiver ' + coordinates(search.estimate) + '.' : 'Saved search hidden.');
  });
  const [minClock, maxClock] = search.clock_bounds;
  set('search-intro', 'The saved run compared ' + search.track_count + ' simulated flight tracks across a 10 × 10 km area, allowing a clock offset from ' + signed(minClock) + ' to ' + signed(maxClock) + ' seconds.');
  set('result-title', 'One supported location');
  set('result-copy', 'Estimated microphone: ' + coordinates(search.estimate) + '. The fit also held on audio blocks kept out of the search.');
  set('result-pair', search.pair.replace('|', ' + '));
  set('result-offset', signed(search.clock) + ' s');
  set('truth-copy', 'Simulated microphone: ' + coordinates(search.truth) + ', ' + search.error.toFixed(1) + ' m from the estimate in this fixture. True clock offset: ' + signed(search.truth_clock) + ' s.');
  if (data.control?.abstained) {
    set('evidence-control', 'When the true tracks were removed in a separate control, the earlier version put a pin ' + data.control.baseline_error_km.toFixed(2) + ' km away. This version withheld the pin on the same inputs.');
  } else {
    id('evidence-control').hidden = true;
  }
  set('evidence-version', 'Fixture ' + data.source.scene + ' · ' + data.source.profile + ' · all coordinates are synthetic');
  id('copy-command').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(id('replay-command').textContent);
      set('copy-status', 'Copied');
    } catch {
      set('copy-status', 'Select and copy the command below.');
    }
  });
  id('case-content').hidden = false;
  updateMap();
})();
