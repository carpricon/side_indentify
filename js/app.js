var App = {
  currentView: 'home',
  pendingVideo: null,

  init: function () {
    var self = this;

    PlaylistDB.init().then(function () {
      Auth.init();
      Search.init();
      Player.init();
      self._trimLogoImages();
      self._bindNavigation();
      self._bindModals();

      var hash = window.location.hash.replace('#', '') || 'home';
      self.navigate(hash);
    }).catch(function (err) {
      UI.showToast('Failed to initialize database', 'error');
    });

    window.addEventListener('hashchange', function () {
      var hash = window.location.hash.replace('#', '') || 'home';
      self.navigate(hash);
    });
  },

  _trimLogoImages: function () {
    // Visually trim transparent margins from logo images at runtime.
    // (Keeps repo dependency-free even without imagemagick.)
    var selectors = ['img.logo-img', 'img.auth-logo-img'];
    var imgs = [];
    selectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) { imgs.push(el); });
    });

    imgs.forEach(function (imgEl) {
      if (!imgEl || imgEl.getAttribute('data-trimmed') === '1') return;
      var src = imgEl.getAttribute('src');
      if (!src) return;

      var img = new Image();
      img.onload = function () {
        try {
          var w = img.width;
          var h = img.height;
          if (!w || !h) return;

          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);

          var imageData = ctx.getImageData(0, 0, w, h);
          var data = imageData.data;

          var minX = w, minY = h, maxX = 0, maxY = 0;
          var found = false;

          for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
              var idx = (y * w + x) * 4;
              var alpha = data[idx + 3];
              if (alpha > 0) {
                found = true;
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
              }
            }
          }

          if (!found) return;
          var cropW = maxX - minX + 1;
          var cropH = maxY - minY + 1;

          // If crop is basically the whole image, skip.
          if (cropW >= w - 2 && cropH >= h - 2) {
            imgEl.setAttribute('data-trimmed', '1');
            return;
          }

          var out = document.createElement('canvas');
          out.width = cropW;
          out.height = cropH;
          var octx = out.getContext('2d');
          octx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

          imgEl.src = out.toDataURL('image/png');
          imgEl.setAttribute('data-trimmed', '1');
        } catch (e) {
          // If canvas is unsupported for any reason, fail silently.
        }
      };
      img.src = src;
    });
  },

  navigate: function (route) {
    var views = document.querySelectorAll('.view');
    views.forEach(function (v) { v.classList.remove('active'); });

    var navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(function (n) { n.classList.remove('active'); });

    var parts = route.split('/');
    var viewName = parts[0];
    var param = parts[1] || null;

    this.currentView = viewName;

    var header = document.getElementById('search-header');
    var nav = document.getElementById('bottom-nav');
    var searchInput = document.getElementById('search-input');

    nav.style.display = 'flex';

    switch (viewName) {
      case 'home':
        header.style.display = 'block';
        searchInput.placeholder = 'YouTube URL을 붙여주세요';
        document.getElementById('view-home').classList.add('active');
        this._setActiveNav('home');
        break;

      case 'playlist':
        if (param) {
          header.style.display = 'none';
          document.getElementById('view-playlist-detail').classList.add('active');
          this._loadPlaylistDetail(param);
        } else {
          // Search is only available on Home
          header.style.display = 'none';
          document.getElementById('view-playlist').classList.add('active');
          this._loadPlaylists();
        }
        this._setActiveNav('playlist');
        break;

      case 'profile':
        header.style.display = 'none';
        document.getElementById('view-profile').classList.add('active');
        this._setActiveNav('profile');
        this._renderProfileView();
        break;

      case 'auth':
        header.style.display = 'none';
        if (Auth.isLoggedIn()) {
          this.navigate('home');
          return;
        }
        document.getElementById('view-auth').classList.add('active');
        break;

      default:
        header.style.display = 'block';
        document.getElementById('view-home').classList.add('active');
        this._setActiveNav('home');
        break;
    }

    window.location.hash = route;
    var mainContent = document.getElementById('main-content');
    mainContent.scrollTop = 0;
  },

  _setActiveNav: function (route) {
    document.querySelectorAll('.nav-item').forEach(function (item) {
      item.classList.toggle('active', item.getAttribute('data-route') === route);
    });
  },

  _bindNavigation: function () {
    var self = this;
    document.querySelectorAll('.nav-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var route = item.getAttribute('data-route');
        // If player is expanded, minimize before navigation
        if (window.Player && Player.isExpanded) {
          Player.minimize();
        }
        self.navigate(route);
      });
    });
  },

  _bindModals: function () {
    var self = this;

    document.querySelectorAll('.modal-close').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var modalId = btn.getAttribute('data-modal');
        UI.hideModal(modalId);
      });
    });

    document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          overlay.style.display = 'none';
          document.body.style.overflow = '';
        }
      });
    });

    document.getElementById('create-playlist-btn').addEventListener('click', function () {
      if (!Auth.isLoggedIn()) {
        UI.showToast('로그인이 필요합니다', 'error');
        return;
      }
      UI.showModal('modal-create-playlist');
    });

    document.getElementById('create-playlist-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = document.getElementById('playlist-name-input').value.trim();
      var desc = document.getElementById('playlist-desc-input').value.trim();

      if (!name) {
        UI.showToast('Playlist name is required', 'error');
        return;
      }

      PlaylistDB.createPlaylist(name, desc).then(function () {
        UI.hideModal('modal-create-playlist');
        document.getElementById('playlist-name-input').value = '';
        document.getElementById('playlist-desc-input').value = '';
        UI.showToast('Playlist created!', 'success');
        self._loadPlaylists();
      }).catch(function (err) {
        // Error message already shown by UI.showToast in playlist.js
        console.error('Playlist creation error:', err);
      });
    });
  },

  _loadPlaylists: function () {
    var listContainer = document.getElementById('playlist-list');
    var emptyState = document.getElementById('playlist-empty');

    listContainer.innerHTML = '';
    emptyState.style.display = 'none';

    PlaylistDB.getPlaylists().then(function (playlists) {
      listContainer.innerHTML = '';

      if (playlists.length === 0) {
        emptyState.querySelector('p').textContent = '\uD50C\uB808\uC774\uB9AC\uC2A4\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4';
        emptyState.querySelector('span').textContent = '\uC0C8 \uD50C\uB808\uC774\uB9AC\uC2A4\uD2B8\uB97C \uB9CC\uB4E4\uC5B4\uBCF4\uC138\uC694';
        emptyState.style.display = 'flex';
        return;
      }

      emptyState.style.display = 'none';
      playlists.forEach(function (pl) {
        listContainer.appendChild(UI.renderPlaylistCard(pl));
      });
    });
  },

  _loadPlaylistDetail: function (playlistId) {
    var self = this;
    var headerContainer = document.getElementById('playlist-detail-header');
    var videosContainer = document.getElementById('playlist-detail-videos');
    var emptyState = document.getElementById('playlist-detail-empty');

     // Prevent async race conditions from rendering duplicated headers/items
     this._playlistDetailRequestId = (this._playlistDetailRequestId || 0) + 1;
     var requestId = this._playlistDetailRequestId;

    headerContainer.innerHTML = '';
    videosContainer.innerHTML = '';

    Promise.all([
      PlaylistDB.getPlaylist(playlistId),
      PlaylistDB.getPlaylistVideos(playlistId)
    ]).then(function (results) {
      if (requestId !== self._playlistDetailRequestId) return;
      var playlist = results[0];
      var videos = results[1];

      if (!playlist) {
        UI.showToast('Playlist not found', 'error');
        self.navigate('playlist');
        return;
      }

      playlist.videoCount = videos.length;
      headerContainer.appendChild(UI.renderPlaylistDetailHeader(playlist));

      if (videos.length === 0) {
        emptyState.style.display = 'flex';
        return;
      }

      emptyState.style.display = 'none';
      videos.forEach(function (video) {
        videosContainer.appendChild(UI.renderPlaylistVideoItem(video, playlistId));
      });
    });
  },

  _renderProfileView: function () {
    var profileSection = document.getElementById('view-profile');
    var user = Auth.getCurrentUser();

    if (!user) {
      profileSection.innerHTML =
        '<div class="profile-container">' +
        '<div class="empty-state">' +
        '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>' +
        '<circle cx="12" cy="7" r="4"></circle>' +
        '</svg>' +
        '<p>\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4</p>' +
        '<span>\uD50C\uB808\uC774\uB9AC\uC2A4\uD2B8\uB97C \uC800\uC7A5\uD558\uB824\uBA74 \uB85C\uADF8\uC778\uD558\uC138\uC694</span>' +
        '<button id="profile-login-btn" class="btn-primary" style="max-width:200px;margin-top:16px;">\uB85C\uADF8\uC778</button>' +
        '</div>' +
        '</div>';
      document.getElementById('profile-login-btn').addEventListener('click', function () {
        App.navigate('auth');
      });
    } else {
      profileSection.innerHTML =
        '<div class="profile-container">' +
        '<div class="profile-avatar">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#808080" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>' +
        '<circle cx="12" cy="7" r="4"></circle>' +
        '</svg>' +
        '</div>' +
        '<h2 class="profile-nickname">' + UI.escapeHtml(user.nickname) + '</h2>' +
        '<p class="profile-email">' + UI.escapeHtml(user.email) + '</p>' +
        '<button id="logout-btn" class="btn-logout">\uB85C\uADF8\uC544\uC6C3</button>' +
        '</div>';
      document.getElementById('logout-btn').addEventListener('click', function () {
        Auth.logout();
      });
    }
  },

  refreshPlaylistDetail: function (playlistId) {
    this._loadPlaylistDetail(playlistId);
  },

  showAddToPlaylistModal: function (video) {
    var self = this;

    if (!Auth.isLoggedIn()) {
      UI.showToast('로그인이 필요합니다', 'error');
      return;
    }

    this.pendingVideo = video;

    PlaylistDB.getPlaylists().then(function (playlists) {
      var container = document.getElementById('modal-playlist-list');
      container.innerHTML = '';

      if (playlists.length === 0) {
        container.innerHTML =
          '<div class="empty-state" style="min-height:100px;">' +
          '<p style="font-size:14px;">No playlists yet</p>' +
          '<span style="font-size:12px;">Create one first</span>' +
          '</div>';
      } else {
        playlists.forEach(function (pl) {
          var item = document.createElement('div');
          item.className = 'modal-playlist-item';
          item.innerHTML =
            '<div class="mpi-icon">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M9 18V5l12-2v13"></path>' +
            '<circle cx="6" cy="18" r="3"></circle>' +
            '<circle cx="18" cy="16" r="3"></circle>' +
            '</svg>' +
            '</div>' +
            '<span class="mpi-name">' + UI.escapeHtml(pl.name) + '</span>';

          item.addEventListener('click', function () {
            if (item.classList.contains('disabled')) return;
            item.classList.add('disabled');
            item.style.opacity = '0.5';
            item.style.pointerEvents = 'none';
            self._addVideoToPlaylist(pl.id);
          });

          container.appendChild(item);
        });
      }

      UI.showModal('modal-add-to-playlist');
    });
  },

  _isAddingVideo: false,

  _addVideoToPlaylist: function (playlistId) {
    var self = this;
    if (!this.pendingVideo || this._isAddingVideo) return;

    this._isAddingVideo = true;

    PlaylistDB.addVideo(playlistId, this.pendingVideo).then(function () {
      UI.hideModal('modal-add-to-playlist');
      UI.showToast('플레이리스트에 추가되었습니다!', 'success');
      self.pendingVideo = null;
      self._isAddingVideo = false;
    }).catch(function (err) {
      self._isAddingVideo = false;
      if (err.message === 'Video already in playlist') {
        UI.showToast('이미 플레이리스트에 있는 곡입니다', 'error');
      } else {
        UI.showToast('추가에 실패했습니다', 'error');
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', function () {
  App.init();
});
