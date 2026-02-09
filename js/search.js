var Search = {
  currentResults: [],
  allResults: [],
  currentFilter: 'all',
  pageTokens: { 1: '' },
  currentPage: 1,
  totalPages: 1,
  currentQuery: '',

  init: function () {
    var self = this;
    var input = document.getElementById('search-input');
    var clearBtn = document.getElementById('search-clear-btn');

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var q = input.value.trim();
        if (q) self.handleSearch(q);
      }
    });

    input.addEventListener('input', function () {
      clearBtn.style.display = input.value ? 'flex' : 'none';
    });

    clearBtn.addEventListener('click', function () {
      input.value = '';
      clearBtn.style.display = 'none';
      input.focus();
    });

    document.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self.currentFilter = btn.getAttribute('data-filter');
        self.applyFilter();
      });
    });
  },

  handleSearch: function (query) {
    this.currentQuery = query;
    this.currentPage = 1;
    this.pageTokens = { 1: '' };

    if (this._isYouTubeUrl(query)) {
      this.searchByURL(query);
    } else {
      this.searchByKeyword(query, '');
    }
  },

  _isYouTubeUrl: function (str) {
    return /(?:youtube\.com|youtu\.be)/.test(str);
  },

  _extractVideoId: function (url) {
    var patterns = [
      /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/
    ];

    for (var i = 0; i < patterns.length; i++) {
      var match = url.match(patterns[i]);
      if (match) return match[1];
    }
    return null;
  },

  searchByURL: function (url) {
    var self = this;
    var videoId = this._extractVideoId(url);
    if (!videoId) {
      UI.showToast('Invalid YouTube URL', 'error');
      return;
    }

    this._showSearchState('loading');

    var apiUrl = CONFIG.YOUTUBE_API_BASE + '/videos?part=snippet,contentDetails&id=' + videoId + '&key=' + CONFIG.YOUTUBE_API_KEY;

    fetch(apiUrl)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.items || data.items.length === 0) {
          self._showSearchState('empty');
          return;
        }

        self.allResults = data.items.map(function (item) {
          return self._mapVideoItem(item, true);
        });
        self.totalPages = 1;
        self.applyFilter();
      })
      .catch(function (err) {
        UI.showToast('Search failed: ' + err.message, 'error');
        self._showSearchState('empty');
      });
  },

  searchByKeyword: function (query, pageToken) {
    var self = this;
    this._showSearchState('loading');

    if (!CONFIG.YOUTUBE_API_KEY) {
      UI.showToast('YouTube API Key is not set. Update js/config.js', 'error');
      this._showSearchState('empty');
      return;
    }

    var filter = this.currentFilter;
    var minSeconds = 0;
    if (filter === '30min') minSeconds = 1800;
    if (filter === '1hour') minSeconds = 3600;

    function buildSearchUrl(token) {
      var url = CONFIG.YOUTUBE_API_BASE + '/search?part=snippet&type=video&maxResults=' + CONFIG.MAX_RESULTS +
        '&q=' + encodeURIComponent(query) +
        (token ? '&pageToken=' + token : '');

      // For long-duration filters, reduce noise at the API level
      if (filter === '30min' || filter === '1hour') {
        url += '&videoDuration=long';
      }

      url += '&key=' + CONFIG.YOUTUBE_API_KEY;
      return url;
    }

    // When a duration filter is active, keep fetching additional API pages until
    // we have enough filtered results to fill the current UI page.
    if (filter === 'all') {
      var apiUrl = buildSearchUrl(pageToken);
      fetch(apiUrl)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) {
            UI.showToast('API Error: ' + (data.error.message || 'Unknown error'), 'error');
            self._showSearchState('empty');
            return;
          }

          if (!data.items || data.items.length === 0) {
            self._showSearchState('empty');
            return;
          }

          // Exclude live/upcoming streams (e.g., 24/7 live) from results
          var filteredItems = data.items.filter(function (item) {
            var live = item && item.snippet && item.snippet.liveBroadcastContent;
            return live !== 'live' && live !== 'upcoming';
          });

          if (filteredItems.length === 0) {
            self._showSearchState('empty');
            return;
          }

          if (data.nextPageToken) {
            self.pageTokens[self.currentPage + 1] = data.nextPageToken;
            self.totalPages = self.currentPage + 1;
          } else {
            self.totalPages = self.currentPage;
          }

          var videoIds = filteredItems.map(function (item) {
            return item.id.videoId;
          }).join(',');

          return self._getVideoDetails(videoIds);
        })
        .then(function (videos) {
          if (!videos) return;
          self.allResults = videos.filter(function (v) {
            return !self._isShortsVideo(v);
          });
          self.applyFilter();
        })
        .catch(function (err) {
          UI.showToast('Search failed: ' + err.message, 'error');
          self._showSearchState('empty');
        });
      return;
    }

    var desiredCount = CONFIG.MAX_RESULTS;
    var collected = [];
    var seen = {};
    var token = pageToken || '';
    var safetyIterations = 0;
    var lastNextToken = '';

    function fetchOnePage(pageTok) {
      var url = buildSearchUrl(pageTok);
      return fetch(url)
        .then(function (r) { return r.json(); });
    }

    function filterSearchItems(items) {
      items = items || [];
      return items.filter(function (item) {
        var live = item && item.snippet && item.snippet.liveBroadcastContent;
        return live !== 'live' && live !== 'upcoming';
      });
    }

    function step() {
      safetyIterations++;
      if (collected.length >= desiredCount || safetyIterations > 6) {
        self.allResults = collected;
        if (lastNextToken) {
          self.pageTokens[self.currentPage + 1] = lastNextToken;
          self.totalPages = self.currentPage + 1;
        } else {
          self.totalPages = self.currentPage;
        }
        self.applyFilter();
        return;
      }

      fetchOnePage(token)
        .then(function (data) {
          if (data.error) {
            UI.showToast('API Error: ' + (data.error.message || 'Unknown error'), 'error');
            self._showSearchState('empty');
            return;
          }

          var items = filterSearchItems(data.items);
          lastNextToken = data.nextPageToken || '';

          if (!items || items.length === 0) {
            if (lastNextToken) {
              token = lastNextToken;
              step();
            } else if (collected.length === 0) {
              self._showSearchState('empty');
            } else {
              self.allResults = collected;
              self.totalPages = self.currentPage;
              self.applyFilter();
            }
            return;
          }

          var videoIds = items.map(function (item) { return item.id.videoId; }).filter(Boolean).join(',');
          if (!videoIds) {
            if (lastNextToken) {
              token = lastNextToken;
              step();
            } else {
              self._showSearchState('empty');
            }
            return;
          }

          self._getVideoDetails(videoIds)
            .then(function (videos) {
              videos = videos || [];
              for (var i = 0; i < videos.length && collected.length < desiredCount; i++) {
                var v = videos[i];
                if (!v || !v.videoId) continue;
                if (seen[v.videoId]) continue;
                if (self._isShortsVideo(v)) continue;
                if (UI.parseDurationToSeconds(v.duration) < minSeconds) continue;
                seen[v.videoId] = true;
                collected.push(v);
              }

              if (collected.length >= desiredCount || !lastNextToken) {
                self.allResults = collected;
                if (lastNextToken) {
                  self.pageTokens[self.currentPage + 1] = lastNextToken;
                  self.totalPages = self.currentPage + 1;
                } else {
                  self.totalPages = self.currentPage;
                }
                self.applyFilter();
                return;
              }

              token = lastNextToken;
              step();
            });
        })
        .catch(function (err) {
          UI.showToast('Search failed: ' + err.message, 'error');
          self._showSearchState('empty');
        });
    }

    step();
  },

  _getVideoDetails: function (videoIds) {
    var self = this;
    var apiUrl = CONFIG.YOUTUBE_API_BASE + '/videos?part=snippet,contentDetails&id=' + videoIds + '&key=' + CONFIG.YOUTUBE_API_KEY;

    return fetch(apiUrl)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.items) return [];
        return data.items.map(function (item) {
          return self._mapVideoItem(item, true);
        });
      });
  },

  _mapVideoItem: function (item, hasContentDetails) {
    var snippet = item.snippet;
    var thumbnail = snippet.thumbnails.medium ? snippet.thumbnails.medium.url : snippet.thumbnails.default.url;
    return {
      videoId: item.id.videoId || item.id,
      title: snippet.title,
      channelTitle: snippet.channelTitle,
      thumbnailUrl: thumbnail,
      duration: hasContentDetails && item.contentDetails ? item.contentDetails.duration : '',
      publishedAt: snippet.publishedAt
    };
  },

  _isShortsVideo: function (video) {
    if (!video) return false;
    var title = (video.title || '').toLowerCase();
    if (title.indexOf('#shorts') !== -1) return true;
    if (/(^|\s)shorts($|\s)/i.test(title)) return true;
    if (video.duration) {
      var sec = UI.parseDurationToSeconds(video.duration);
      if (sec > 0 && sec < 61) return true;
    }
    return false;
  },

  applyFilter: function () {
    var self = this;

    if (this.currentFilter === 'all') {
      this.currentResults = this.allResults.slice();
    } else {
      var minSeconds = this.currentFilter === '30min' ? 1800 : 3600;
      this.currentResults = this.allResults.filter(function (v) {
        return UI.parseDurationToSeconds(v.duration) >= minSeconds;
      });
    }

    this.renderResults();
  },

  renderResults: function () {
    var container = document.getElementById('search-results');
    var pagination = document.getElementById('search-pagination');
    var emptyState = document.getElementById('search-empty');

    container.innerHTML = '';
    UI.hideLoading();

    if (this.currentResults.length === 0) {
      emptyState.style.display = 'flex';
      pagination.innerHTML = '';
      return;
    }

    emptyState.style.display = 'none';

    this.currentResults.forEach(function (video) {
      container.appendChild(UI.renderVideoCard(video));
    });

    var self = this;
    UI.renderPagination(pagination, this.currentPage, this.totalPages, function (page) {
      self.currentPage = page;
      var token = self.pageTokens[page] || '';
      self.searchByKeyword(self.currentQuery, token);
    });
  },

  _showSearchState: function (state) {
    var container = document.getElementById('search-results');
    var emptyState = document.getElementById('search-empty');

    if (state === 'loading') {
      container.innerHTML = '';
      emptyState.style.display = 'none';
      UI.showLoading();
    } else if (state === 'empty') {
      container.innerHTML = '';
      UI.hideLoading();
      emptyState.style.display = 'flex';
    }
  }
};
