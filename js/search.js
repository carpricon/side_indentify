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
    if (App.currentView === 'playlist') {
      this._filterPlaylists(query);
      return;
    }

    this.currentQuery = query;
    this.currentPage = 1;
    this.pageTokens = { 1: '' };

    if (this._isYouTubeUrl(query)) {
      this.searchByURL(query);
    } else {
      this.searchByKeyword(query, '');
    }
  },

  _filterPlaylists: function (query) {
    var listContainer = document.getElementById('playlist-list');
    var emptyState = document.getElementById('playlist-empty');

    if (!query) {
      PlaylistDB.getPlaylists().then(function (playlists) {
        listContainer.innerHTML = '';
        emptyState.style.display = playlists.length === 0 ? 'flex' : 'none';
        playlists.forEach(function (pl) {
          listContainer.appendChild(UI.renderPlaylistCard(pl));
        });
      });
      return;
    }

    PlaylistDB.getPlaylists().then(function (playlists) {
      var filtered = playlists.filter(function (pl) {
        return pl.name.toLowerCase().indexOf(query.toLowerCase()) !== -1;
      });

      listContainer.innerHTML = '';

      if (filtered.length === 0) {
        if (!emptyState.originalContent) {
          emptyState.originalContent = emptyState.innerHTML;
        }
        emptyState.innerHTML =
          '<div style="text-align:center; padding: 40px 20px;">' +
          '<p style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">검색 결과가 없습니다</p>' +
          '<span style="font-size: 14px; color: #666;">"' + UI.escapeHtml(query) + '"에 해당하는 플레이리스트가 없습니다.</span>' +
          '</div>';
        emptyState.style.display = 'flex';
        return;
      }

      emptyState.style.display = 'none';
      filtered.forEach(function (pl) {
        listContainer.appendChild(UI.renderPlaylistCard(pl));
      });
    });
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

    var apiUrl = CONFIG.YOUTUBE_API_BASE + '/search?part=snippet&type=video&maxResults=' + CONFIG.MAX_RESULTS +
      '&q=' + encodeURIComponent(query) +
      (pageToken ? '&pageToken=' + pageToken : '') +
      '&key=' + CONFIG.YOUTUBE_API_KEY;

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

        if (data.nextPageToken) {
          self.pageTokens[self.currentPage + 1] = data.nextPageToken;
          self.totalPages = self.currentPage + 1;
        } else {
          self.totalPages = self.currentPage;
        }

        var videoIds = data.items.map(function (item) {
          return item.id.videoId;
        }).join(',');

        return self._getVideoDetails(videoIds);
      })
      .then(function (videos) {
        if (!videos) return;
        self.allResults = videos;
        self.applyFilter();
      })
      .catch(function (err) {
        UI.showToast('Search failed: ' + err.message, 'error');
        self._showSearchState('empty');
      });
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
