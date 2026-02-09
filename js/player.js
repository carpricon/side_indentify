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
    this._bindSwipeGesture();
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
        this._updateMediaSessionPlaybackState('playing');
        break;
      case YT.PlayerState.PAUSED:
        this.isPlaying = false;
        this._updatePlayPauseIcon(false);
        this._stopProgress();
        this._updateMediaSessionPlaybackState('paused');
        break;
      case YT.PlayerState.ENDED:
        this.isPlaying = false;
        this._stopProgress();
        this._updateMediaSessionPlaybackState('none');
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
    setTimeout(function () {
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
    this._updateMediaSession(video);
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

  _updateMediaSession: function (video) {
    if (!('mediaSession' in navigator)) return;
    var self = this;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: video.title || '',
      artist: video.channelTitle || '',
      album: 'Indentify',
      artwork: [
        { src: video.thumbnailUrl || '', sizes: '320x180', type: 'image/jpeg' }
      ]
    });

    navigator.mediaSession.setActionHandler('play', function () {
      self.togglePlayPause();
    });
    navigator.mediaSession.setActionHandler('pause', function () {
      self.togglePlayPause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', function () {
      self.prev();
    });
    navigator.mediaSession.setActionHandler('nexttrack', function () {
      self.next();
    });
    navigator.mediaSession.setActionHandler('seekto', function (details) {
      if (details.seekTime != null && self.isReady) {
        self.ytPlayer.seekTo(details.seekTime, true);
      }
    });
  },

  _updateMediaSessionPlaybackState: function (state) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = state;
  },

  _renderQueue: function () {
    var container = document.getElementById('mp-queue-list');
    if (!container) return;
    container.innerHTML = '';
    var self = this;

    this.queue.forEach(function (video, idx) {
      var item = document.createElement('div');
      item.className = 'queue-item' + (idx === self.currentIndex ? ' active' : '');
      item.setAttribute('draggable', 'true');
      item.setAttribute('data-queue-index', String(idx));
      item.innerHTML =
        '<div class="queue-reorder-handle" aria-label="Reorder">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<line x1="4" y1="7" x2="20" y2="7"></line>' +
            '<line x1="4" y1="12" x2="20" y2="12"></line>' +
            '<line x1="4" y1="17" x2="20" y2="17"></line>' +
          '</svg>' +
        '</div>' +
        '<img class="queue-thumb" src="' + video.thumbnailUrl + '" alt="">' +
        '<div class="queue-info">' +
          '<div class="queue-title">' + UI.escapeHtml(video.title) + '</div>' +
          '<div class="queue-channel">' + UI.escapeHtml(video.channelTitle) + '</div>' +
        '</div>' +
        '<div class="queue-actions">' +
          '<button class="queue-move-up" aria-label="Move up">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<polyline points="18 15 12 9 6 15"></polyline>' +
            '</svg>' +
          '</button>' +
          '<button class="queue-move-down" aria-label="Move down">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<polyline points="6 9 12 15 18 9"></polyline>' +
            '</svg>' +
          '</button>' +
        '</div>';

      // Tap to play
      item.addEventListener('click', function () {
        self.currentIndex = idx;
        self._loadCurrent();
      });

      // Move up/down
      var upBtn = item.querySelector('.queue-move-up');
      if (upBtn) {
        upBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          self._moveQueueItem(idx, Math.max(0, idx - 1));
        });
      }
      var downBtn = item.querySelector('.queue-move-down');
      if (downBtn) {
        downBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          self._moveQueueItem(idx, Math.min(self.queue.length - 1, idx + 1));
        });
      }

      // Drag & drop (desktop)
      item.addEventListener('dragstart', function (e) {
        try {
          e.dataTransfer.setData('text/plain', String(idx));
          e.dataTransfer.effectAllowed = 'move';
        } catch (_) { }
      });
      item.addEventListener('dragover', function (e) {
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'move'; } catch (_) { }
      });
      item.addEventListener('drop', function (e) {
        e.preventDefault();
        var from = -1;
        try { from = parseInt(e.dataTransfer.getData('text/plain'), 10); } catch (_) { }
        if (isNaN(from) || from < 0) return;
        self._moveQueueItem(from, idx);
      });
      container.appendChild(item);
    });
  },

  _moveQueueItem: function (fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= this.queue.length || toIndex >= this.queue.length) return;

    var item = this.queue.splice(fromIndex, 1)[0];
    this.queue.splice(toIndex, 0, item);

    // Keep currentIndex pointing at the same playing item
    if (this.currentIndex === fromIndex) {
      this.currentIndex = toIndex;
    } else if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) {
      this.currentIndex -= 1;
    } else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) {
      this.currentIndex += 1;
    }

    this._renderQueue();
  },

  _fetchRelatedVideos: function (videoId) {
    var self = this;
    if (!CONFIG.YOUTUBE_API_KEY) return;
    if (this._relatedFetchInFlight) return;

    var currentVideo = this.queue[this.currentIndex];
    if (!currentVideo) return;

    this._relatedFetchInFlight = true;

    function normalizeTitle(title) {
      if (!title) return '';
      var t = String(title).toLowerCase();

      // Remove bracketed/parenthesized segments
      t = t.replace(/\([^)]*\)/g, ' ');
      t = t.replace(/\[[^\]]*\]/g, ' ');

      // Remove common noise words
      t = t
        .replace(/\b(official|mv|m\/v|music video|lyrics?|audio|live|performance|cover|reaction|remix|teaser|trailer)\b/g, ' ')
        .replace(/\b(feat\.?|ft\.?|featuring)\b/g, ' ');

      // Collapse punctuation/whitespace
      t = t.replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3\s]/g, ' ');
      t = t.replace(/\s+/g, ' ').trim();
      return t;
    }

    function shuffle(arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    }

    function inferGenreQuery(video) {
      var title = (video && video.title) ? String(video.title).toLowerCase() : '';
      var candidates = [
        { re: /lofi|lo-fi/, q: 'lofi mix' },
        { re: /jazz/, q: 'jazz mix' },
        { re: /acoustic/, q: 'acoustic mix' },
        { re: /rock/, q: 'rock mix' },
        { re: /edm|house|techno/, q: 'edm mix' },
        { re: /hip\s?hop|rap/, q: 'hip hop mix' },
        { re: /r\s?&\s?b|rnb/, q: 'rnb mix' },
        { re: /k-?pop|케이팝/, q: 'kpop mix' },
        { re: /j-?pop/, q: 'jpop mix' }
      ];

      for (var i = 0; i < candidates.length; i++) {
        if (candidates[i].re.test(title)) return candidates[i].q;
      }

      // Fallback: broad but music-oriented
      return 'music mix';
    }

    function isShorts(video) {
      if (!video) return false;
      var title = (video.title || '').toLowerCase();
      if (title.indexOf('#shorts') !== -1) return true;
      if (/(^|\s)shorts($|\s)/i.test(title)) return true;
      if (video.duration) {
        var sec = UI.parseDurationToSeconds(video.duration);
        if (sec > 0 && sec < 61) return true;
      }
      return false;
    }

    var currentNorm = normalizeTitle(currentVideo.title);
    var existingIds = this.queue.map(function (v) { return v.videoId; });
    var maxToAdd = 20;

    var relatedUrl = CONFIG.YOUTUBE_API_BASE + '/search?part=snippet&type=video&maxResults=25' +
      '&relatedToVideoId=' + encodeURIComponent(videoId) +
      '&videoCategoryId=10' +
      '&key=' + CONFIG.YOUTUBE_API_KEY;

    var genreQuery = inferGenreQuery(currentVideo);
    var genreUrl = CONFIG.YOUTUBE_API_BASE + '/search?part=snippet&type=video&maxResults=25' +
      '&q=' + encodeURIComponent(genreQuery) +
      '&videoCategoryId=10' +
      '&key=' + CONFIG.YOUTUBE_API_KEY;

    Promise.all([
      fetch(relatedUrl).then(function (r) { return r.json(); }).catch(function () { return {}; }),
      fetch(genreUrl).then(function (r) { return r.json(); }).catch(function () { return {}; })
    ])
      .then(function (results) {
        var relatedData = results[0] || {};
        var genreData = results[1] || {};

        function filterSearchItems(items) {
          items = items || [];
          return items.filter(function (item) {
            var live = item && item.snippet && item.snippet.liveBroadcastContent;
            var vid = item && item.id && item.id.videoId;
            return !!vid && live !== 'live' && live !== 'upcoming';
          });
        }

        var relatedItems = filterSearchItems(relatedData.items);
        var genreItems = filterSearchItems(genreData.items);

        // Build a de-duped id list and keep source info for 50/50 mixing
        var sourceById = {};
        var ids = [];

        relatedItems.forEach(function (item) {
          var id = item.id.videoId;
          if (!sourceById[id]) {
            sourceById[id] = 'artist';
            ids.push(id);
          }
        });

        genreItems.forEach(function (item) {
          var id = item.id.videoId;
          if (!sourceById[id]) {
            sourceById[id] = 'genre';
            ids.push(id);
          }
        });

        // Limit ids to keep the /videos call small
        ids = ids.slice(0, 50);
        if (ids.length === 0) return [];

        return fetch(CONFIG.YOUTUBE_API_BASE + '/videos?part=snippet,contentDetails&id=' + ids.join(',') + '&key=' + CONFIG.YOUTUBE_API_KEY)
          .then(function (r) { return r.json(); })
          .then(function (detailData) {
            var items = (detailData && detailData.items) ? detailData.items : [];
            return items.map(function (item) {
              var snippet = item.snippet || {};
              var thumbnail = snippet.thumbnails && snippet.thumbnails.medium ? snippet.thumbnails.medium.url : (snippet.thumbnails && snippet.thumbnails.default ? snippet.thumbnails.default.url : '');
              var id = typeof item.id === 'string' ? item.id : item.id.videoId;
              return {
                videoId: id,
                title: snippet.title,
                channelTitle: snippet.channelTitle,
                thumbnailUrl: thumbnail,
                duration: item.contentDetails ? item.contentDetails.duration : '',
                isAutoRecommended: true,
                _source: sourceById[id] || 'genre'
              };
            });
          });
      })
      .then(function (candidates) {
        candidates = candidates || [];

        // Dedup + exclude same-song variants + exclude shorts
        candidates = candidates.filter(function (v) {
          if (!v || !v.videoId) return false;
          if (existingIds.indexOf(v.videoId) !== -1) return false;
          var norm = normalizeTitle(v.title);
          if (!norm) return false;
          if (norm === currentNorm) return false;
          // Exclude near-identical title variants of the same song
          if (currentNorm && (norm.indexOf(currentNorm) !== -1 || currentNorm.indexOf(norm) !== -1)) {
            if (Math.min(norm.length, currentNorm.length) >= 8) return false;
          }
          if (isShorts(v)) return false;
          return true;
        });

        // Split by source for 50/50 mixing
        var artistCandidates = candidates.filter(function (v) { return v._source === 'artist'; });
        var genreCandidates = candidates.filter(function (v) { return v._source !== 'artist'; });

        shuffle(artistCandidates);
        shuffle(genreCandidates);

        var perArtistCap = Math.max(1, Math.ceil(maxToAdd * 0.3));
        var batchCounts = {};

        function canTake(v) {
          var key = (v.channelTitle || '').toLowerCase();
          if (!key) return true;
          var c = batchCounts[key] || 0;
          return c < perArtistCap;
        }

        function take(v, out) {
          var key = (v.channelTitle || '').toLowerCase();
          if (key) batchCounts[key] = (batchCounts[key] || 0) + 1;
          delete v._source;
          out.push(v);
        }

        function fillFrom(list, out, limit) {
          for (var i = 0; i < list.length && out.length < limit; i++) {
            if (!canTake(list[i])) continue;
            take(list[i], out);
          }
        }

        var toAdd = [];
        var half = Math.floor(maxToAdd / 2);
        fillFrom(artistCandidates, toAdd, half);
        fillFrom(genreCandidates, toAdd, maxToAdd);

        // If we couldn't hit the target (due to caps), relax by filling remaining ignoring caps
        if (toAdd.length < maxToAdd) {
          var remainder = shuffle(candidates.slice());
          for (var r = 0; r < remainder.length && toAdd.length < maxToAdd; r++) {
            var v = remainder[r];
            // ensure we don't add duplicates inside the batch
            if (toAdd.some(function (x) { return x.videoId === v.videoId; })) continue;
            delete v._source;
            toAdd.push(v);
          }
        }

        for (var i = 0; i < toAdd.length; i++) {
          self.queue.push(toAdd[i]);
        }

        if (toAdd.length > 0) {
          self._renderQueue();
        }
      })
      .catch(function () {
        // no-op
      })
      .then(function () {
        self._relatedFetchInFlight = false;
      });
  },

  _bindSwipeGesture: function () {
    var self = this;
    var expandedEl = document.getElementById('mp-expanded');
    if (!expandedEl) return;

    var startY = 0;
    var currentY = 0;
    var isDragging = false;
    var playerEl = document.getElementById('mini-player');

    expandedEl.addEventListener('touchstart', function (e) {
      if (!self.isExpanded) return;
      // Don't capture swipe on interactive elements
      if (e.target.closest('.mp-main-controls, .mp-volume-group, .mpx-progress-bar, .mp-queue-list, .mp-add-playlist-btn')) return;
      startY = e.touches[0].clientY;
      currentY = startY;
      isDragging = true;
      playerEl.style.transition = 'none';
    }, { passive: true });

    expandedEl.addEventListener('touchmove', function (e) {
      if (!isDragging || !self.isExpanded) return;
      currentY = e.touches[0].clientY;
      var deltaY = currentY - startY;
      if (deltaY > 0) {
        // Only allow downward drag
        var translateY = Math.min(deltaY, window.innerHeight);
        var opacity = 1 - (deltaY / window.innerHeight) * 0.5;
        expandedEl.style.transform = 'translateY(' + translateY + 'px)';
        expandedEl.style.opacity = Math.max(opacity, 0.5);
      }
    }, { passive: true });

    expandedEl.addEventListener('touchend', function () {
      if (!isDragging) return;
      isDragging = false;
      var deltaY = currentY - startY;
      playerEl.style.transition = '';
      expandedEl.style.transform = '';
      expandedEl.style.opacity = '';

      // If swiped down more than 100px or fast enough, minimize
      if (deltaY > 100) {
        self.minimize();
      }
    }, { passive: true });

    expandedEl.addEventListener('touchcancel', function () {
      isDragging = false;
      playerEl.style.transition = '';
      expandedEl.style.transform = '';
      expandedEl.style.opacity = '';
    }, { passive: true });
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
      btn = e.target.closest('#mp-prev, #mp-prev-mini');
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

      // Add to Playlist from expanded player
      btn = e.target.closest('#mpx-add-to-playlist');
      if (btn) {
        e.stopPropagation();
        var currentVideo = self.queue[self.currentIndex];
        if (currentVideo) {
          if (!Auth.isLoggedIn()) {
            UI.showToast('로그인이 필요합니다', 'error');
            return;
          }
          App.showAddToPlaylistModal(currentVideo);
        }
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
