var Player = {
  ytPlayer: null,
  isReady: false,
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  isExpanded: false,
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
    var container = document.getElementById('yt-player');
    if (!container) return;

    this.ytPlayer = new YT.Player('yt-player', {
      height: '100%',
      width: '100%',
      playerVars: {
        controls: 0,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
        fs: 0,
        origin: window.location.origin
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
    var messages = {
      2: '\uC798\uBABB\uB41C \uC601\uC0C1 ID\uC785\uB2C8\uB2E4',
      5: 'HTML5 \uD50C\uB808\uC774\uC5B4 \uC624\uB958\uC785\uB2C8\uB2E4',
      100: '\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4',
      101: '\uC774 \uC601\uC0C1\uC740 \uC678\uBD80 \uC7AC\uC0DD\uC774 \uC81C\uD55C\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4',
      150: '\uC774 \uC601\uC0C1\uC740 \uC678\uBD80 \uC7AC\uC0DD\uC774 \uC81C\uD55C\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4'
    };
    UI.showToast(messages[code] || '\uC601\uC0C1 \uC7AC\uC0DD \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4', 'error');
    var self = this;
    setTimeout(function () {
      if (self.queue.length > 1) {
        self.next();
      }
    }, 1500);
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

    var self = this;
    setTimeout(function() {
      self._fetchRelatedVideos(video.videoId);
    }, 1000);
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
    this._setVolumeSlider(val);
  },

  maximize: function () {
    this.isExpanded = true;
    var playerEl = document.getElementById('mini-player');
    var appEl = document.getElementById('app');
    if (playerEl) playerEl.classList.add('expanded');
    if (appEl) appEl.classList.add('player-expanded');
  },

  minimize: function () {
    this.isExpanded = false;
    var playerEl = document.getElementById('mini-player');
    var appEl = document.getElementById('app');
    if (playerEl) playerEl.classList.remove('expanded');
    if (appEl) appEl.classList.remove('player-expanded');
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
    this._updatePlayerUI(video);
    this._showMiniPlayer();
    this._renderQueue();

    if (!this.isReady) {
      var self = this;
      this._pendingCommands.push(function () {
        self.ytPlayer.loadVideoById(video.videoId);
      });
      return;
    }

    try {
      this.ytPlayer.loadVideoById(video.videoId);
    } catch (err) {
      UI.showToast('\uC601\uC0C1\uC744 \uB85C\uB4DC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4', 'error');
    }

    if (this.queue.length <= this.currentIndex + 3) {
      this._fetchRelatedVideos(video.videoId);
    }
  },

  _showMiniPlayer: function () {
    var el = document.getElementById('mini-player');
    if (el) {
      el.classList.add('visible');
      document.getElementById('app').classList.add('player-active');
    }
  },

  _updatePlayerUI: function (video) {
    // Mini Player
    var thumb = document.getElementById('mp-thumb');
    var title = document.getElementById('mp-title');
    var channel = document.getElementById('mp-channel');
    if (thumb) thumb.src = video.thumbnailUrl || '';
    if (title) title.textContent = video.title || '';
    if (channel) channel.textContent = video.channelTitle || '';

    // Expanded Player
    var xthumb = document.getElementById('mpx-thumb');
    var xtitle = document.getElementById('mpx-title');
    var xchannel = document.getElementById('mpx-channel');
    if (xthumb) xthumb.src = video.thumbnailUrl || '';
    if (xtitle) xtitle.textContent = video.title || '';
    if (xchannel) xchannel.textContent = video.channelTitle || '';
  },

  _updatePlayPauseIcon: function (playing) {
    var btn = document.getElementById('mp-play-pause');
    var xbtn = document.getElementById('mpx-play-pause');
    var iconPlay = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    var iconPause = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>';
    var xiconPlay = '<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    var xiconPause = '<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>';

    if (btn) btn.innerHTML = playing ? iconPause : iconPlay;
    if (xbtn) xbtn.innerHTML = playing ? xiconPause : xiconPlay;
  },

  _updateDuration: function () {
    var dur = this.ytPlayer.getDuration();
    var xdurEl = document.getElementById('mpx-duration');
    if (xdurEl) xdurEl.textContent = this._fmt(dur);
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

      // Mini
      var bar = document.getElementById('mp-progress-fill');
      if (bar) bar.style.width = pct + '%';

      // Expanded
      var xbar = document.getElementById('mpx-progress-fill');
      if (xbar) xbar.style.width = pct + '%';
      var xtimeEl = document.getElementById('mpx-current-time');
      if (xtimeEl) xtimeEl.textContent = self._fmt(cur);
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
    var xslider = document.getElementById('mpx-volume');
    if (xslider) xslider.value = val;
  },

  _renderQueue: function () {
    var container = document.getElementById('mp-queue-list');
    if (!container) return;
    container.innerHTML = '';
    var self = this;

    this.queue.forEach(function (video, idx) {
      var item = document.createElement('div');
      item.className = 'queue-item' + (idx === self.currentIndex ? ' active' : '');
      item.innerHTML =
        '<img class="queue-thumb" src="' + video.thumbnailUrl + '" alt="">' +
        '<div class="queue-info">' +
        '<div class="queue-title">' + UI.escapeHtml(video.title) + '</div>' +
        '<div class="queue-channel">' + UI.escapeHtml(video.channelTitle) + '</div>' +
        (video.isAutoRecommended ? '<div class="queue-badge">\uCD94\uCC9C</div>' : '') +
        '</div>';

      item.addEventListener('click', function () {
        self.currentIndex = idx;
        self._loadCurrent();
      });
      container.appendChild(item);
    });
  },

  _fetchRelatedVideos: function (videoId) {
    var self = this;
    if (!CONFIG.YOUTUBE_API_KEY) return;

    var currentVideo = this.queue[this.currentIndex];
    if (!currentVideo) return;

    var searchQuery = currentVideo.channelTitle + ' ' + currentVideo.title.split('(')[0].split('[')[0].trim();
    if (searchQuery.length > 50) searchQuery = searchQuery.substring(0, 50);

    var apiUrl = CONFIG.YOUTUBE_API_BASE + '/search?part=snippet&type=video&maxResults=20' +
      '&q=' + encodeURIComponent(searchQuery) +
      '&videoCategoryId=10' +
      '&key=' + CONFIG.YOUTUBE_API_KEY;

    fetch(apiUrl)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.items || data.items.length === 0) return;

        var videoIds = data.items.map(function (item) {
          return item.id.videoId;
        }).filter(Boolean).join(',');

        if (!videoIds) return;

        return fetch(CONFIG.YOUTUBE_API_BASE + '/videos?part=snippet,contentDetails&id=' + videoIds + '&key=' + CONFIG.YOUTUBE_API_KEY)
          .then(function (r) { return r.json(); })
          .then(function (detailData) {
            if (!detailData.items) return;

            var existingIds = self.queue.map(function (v) { return v.videoId; });
            var newVideos = detailData.items
              .filter(function (item) {
                var id = typeof item.id === 'string' ? item.id : item.id.videoId;
                return existingIds.indexOf(id) === -1;
              })
              .map(function (item) {
                var snippet = item.snippet;
                var thumbnail = snippet.thumbnails.medium ? snippet.thumbnails.medium.url : snippet.thumbnails.default.url;
                return {
                  videoId: typeof item.id === 'string' ? item.id : item.id.videoId,
                  title: snippet.title,
                  channelTitle: snippet.channelTitle,
                  thumbnailUrl: thumbnail,
                  duration: item.contentDetails ? item.contentDetails.duration : '',
                  isAutoRecommended: true
                };
              });

            var added = 0;
            for (var i = 0; i < newVideos.length && added < 20; i++) {
              self.queue.push(newVideos[i]);
              added++;
            }

            if (added > 0) {
              self._renderQueue();
            }
          });
      })
      .catch(function () {});
  },

  _bindControls: function () {
    var self = this;

    document.addEventListener('click', function (e) {
      var btn;

      // Play/Pause
      btn = e.target.closest('#mp-play-pause, #mpx-play-pause');
      if (btn) {
        e.stopPropagation();
        self.togglePlayPause();
        return;
      }

      // Next/Prev
      btn = e.target.closest('#mp-next, #mpx-next');
      if (btn) {
        e.stopPropagation();
        self.next();
        return;
      }
      btn = e.target.closest('#mp-prev');
      if (btn) {
        e.stopPropagation();
        self.prev();
        return;
      }

      // Minimize
      btn = e.target.closest('#mp-minimize');
      if (btn) {
        e.stopPropagation();
        self.minimize();
        return;
      }

      // Maximize (clicking on the mini bar area)
      var bar = e.target.closest('#mp-bar');
      if (bar && !e.target.closest('.mp-controls') && !e.target.closest('.mp-progress-bar')) {
        self.maximize();
        return;
      }
    });

    // Progress Bindings
    var bars = ['mp-progress-bar', 'mpx-progress-bar'];
    bars.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          var rect = el.getBoundingClientRect();
          var frac = (e.clientX - rect.left) / rect.width;
          frac = Math.max(0, Math.min(1, frac));
          self.seekTo(frac);
        });
      }
    });

    // Volume Binding
    var volSlider = document.getElementById('mpx-volume');
    if (volSlider) {
      volSlider.addEventListener('input', function () {
        self.setVolume(parseInt(volSlider.value, 10));
      });
    }
  }
};
