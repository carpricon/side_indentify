var Player = {
  ytPlayer: null,
  isReady: false,
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  progressInterval: null,
  _pendingCommands: [],

  init: function () {
    this._injectIframeAPI();
    this._bindControls();
  },

  _injectIframeAPI: function () {
    if (window.YT && typeof window.YT.Player === 'function') {
      this._createPlayer();
      return;
    }
    var self = this;
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === 'function') prev();
      self._createPlayer();
    };
    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    var first = document.getElementsByTagName('script')[0];
    first.parentNode.insertBefore(tag, first);
  },

  _createPlayer: function () {
    var self = this;
    this.ytPlayer = new YT.Player('yt-player', {
      height: '1',
      width: '1',
      playerVars: {
        controls: 0,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
        fs: 0
      },
      events: {
        onReady: function () { self._onReady(); },
        onStateChange: function (e) { self._onStateChange(e); },
        onError: function (e) { self._onError(e); }
      }
    });
  },

  _onReady: function () {
    this.isReady = true;
    this.ytPlayer.setVolume(80);
    this._setVolumeSlider(80);
    while (this._pendingCommands.length) {
      var cmd = this._pendingCommands.shift();
      cmd();
    }
  },

  _onStateChange: function (e) {
    switch (e.data) {
      case YT.PlayerState.PLAYING:
        this.isPlaying = true;
        this._updatePlayPauseIcon(true);
        this._startProgress();
        this._updateDuration();
        break;
      case YT.PlayerState.PAUSED:
        this.isPlaying = false;
        this._updatePlayPauseIcon(false);
        this._stopProgress();
        break;
      case YT.PlayerState.ENDED:
        this.isPlaying = false;
        this._stopProgress();
        this.next();
        break;
      case YT.PlayerState.BUFFERING:
        break;
    }
  },

  _onError: function (e) {
    var code = e.data;
    // 100 = not found, 101/150 = not embeddable
    if (code === 100 || code === 101 || code === 150) {
      UI.showToast('This video cannot be played', 'error');
      this.next();
    }
  },

  /**
   * @param {Object} video  – { videoId, title, channelTitle, thumbnailUrl, duration }
   * @param {Array}  [list] – optional full list; video becomes current within it
   */
  playNow: function (video, list) {
    if (list && list.length) {
      this.queue = list.slice();
      this.currentIndex = this._findIndex(video.videoId);
      if (this.currentIndex === -1) {
        this.queue.unshift(video);
        this.currentIndex = 0;
      }
    } else {
      var idx = this._findIndex(video.videoId);
      if (idx !== -1) {
        this.currentIndex = idx;
      } else {
        this.queue = [video];
        this.currentIndex = 0;
      }
    }
    this._loadCurrent();
  },

  togglePlayPause: function () {
    if (!this.isReady || this.currentIndex === -1) return;
    if (this.isPlaying) {
      this.ytPlayer.pauseVideo();
    } else {
      this.ytPlayer.playVideo();
    }
  },

  next: function () {
    if (this.queue.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.queue.length;
    this._loadCurrent();
  },

  prev: function () {
    if (this.queue.length === 0) return;
    if (this.isReady && this.ytPlayer.getCurrentTime() > 3) {
      this.ytPlayer.seekTo(0, true);
      return;
    }
    this.currentIndex = (this.currentIndex - 1 + this.queue.length) % this.queue.length;
    this._loadCurrent();
  },

  seekTo: function (fraction) {
    if (!this.isReady) return;
    var duration = this.ytPlayer.getDuration();
    this.ytPlayer.seekTo(duration * fraction, true);
  },

  setVolume: function (val) {
    if (!this.isReady) return;
    this.ytPlayer.setVolume(val);
  },

  _findIndex: function (videoId) {
    for (var i = 0; i < this.queue.length; i++) {
      if (this.queue[i].videoId === videoId) return i;
    }
    return -1;
  },

  _loadCurrent: function () {
    var video = this.queue[this.currentIndex];
    if (!video) return;
    this._updateMiniPlayerUI(video);
    this._showMiniPlayer();

    if (!this.isReady) {
      var self = this;
      this._pendingCommands.push(function () {
        self.ytPlayer.loadVideoById(video.videoId);
      });
      return;
    }
    this.ytPlayer.loadVideoById(video.videoId);
  },

  _showMiniPlayer: function () {
    var el = document.getElementById('mini-player');
    if (el) {
      el.classList.add('visible');
      document.getElementById('app').classList.add('player-active');
    }
  },

  hideMiniPlayer: function () {
    var el = document.getElementById('mini-player');
    if (el) {
      el.classList.remove('visible');
      document.getElementById('app').classList.remove('player-active');
    }
  },

  _updateMiniPlayerUI: function (video) {
    var thumb = document.getElementById('mp-thumb');
    var title = document.getElementById('mp-title');
    var channel = document.getElementById('mp-channel');
    if (thumb) thumb.src = video.thumbnailUrl || '';
    if (title) title.textContent = video.title || '';
    if (channel) channel.textContent = video.channelTitle || '';
  },

  _updatePlayPauseIcon: function (playing) {
    var btn = document.getElementById('mp-play-pause');
    if (!btn) return;
    if (playing) {
      btn.innerHTML =
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>';
    } else {
      btn.innerHTML =
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    }
  },

  _updateDuration: function () {
    var dur = this.ytPlayer.getDuration();
    var el = document.getElementById('mp-duration');
    if (el) el.textContent = this._fmt(dur);
  },

  _startProgress: function () {
    this._stopProgress();
    var self = this;
    this.progressInterval = setInterval(function () {
      if (!self.isReady) return;
      var cur = self.ytPlayer.getCurrentTime();
      var dur = self.ytPlayer.getDuration();
      if (dur <= 0) return;
      var pct = (cur / dur) * 100;
      var bar = document.getElementById('mp-progress-fill');
      if (bar) bar.style.width = pct + '%';
      var timeEl = document.getElementById('mp-current-time');
      if (timeEl) timeEl.textContent = self._fmt(cur);
    }, 250);
  },

  _stopProgress: function () {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  },

  _fmt: function (sec) {
    if (!sec || isNaN(sec)) return '0:00';
    sec = Math.floor(sec);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  },

  _setVolumeSlider: function (val) {
    var slider = document.getElementById('mp-volume');
    if (slider) slider.value = val;
  },

  _bindControls: function () {
    var self = this;

    document.addEventListener('click', function (e) {
      var btn;

      btn = e.target.closest('#mp-play-pause');
      if (btn) { self.togglePlayPause(); return; }

      btn = e.target.closest('#mp-next');
      if (btn) { self.next(); return; }

      btn = e.target.closest('#mp-prev');
      if (btn) { self.prev(); return; }
    });

    var progressBar = document.getElementById('mp-progress-bar');
    if (progressBar) {
      progressBar.addEventListener('click', function (e) {
        var rect = progressBar.getBoundingClientRect();
        var frac = (e.clientX - rect.left) / rect.width;
        frac = Math.max(0, Math.min(1, frac));
        self.seekTo(frac);
        var bar = document.getElementById('mp-progress-fill');
        if (bar) bar.style.width = (frac * 100) + '%';
      });
    }

    var volSlider = document.getElementById('mp-volume');
    if (volSlider) {
      volSlider.addEventListener('input', function () {
        self.setVolume(parseInt(volSlider.value, 10));
      });
    }
  }
};
