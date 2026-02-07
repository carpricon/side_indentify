var App = {
  currentView: 'home',
  pendingVideo: null,

  init: function () {
    var self = this;

    PlaylistDB.init().then(function () {
      Auth.init();
      Search.init();
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

    if (viewName === 'auth') {
      header.style.display = 'none';
      nav.style.display = 'none';
    } else {
      header.style.display = 'block';
      nav.style.display = 'flex';
    }

    switch (viewName) {
      case 'home':
        document.getElementById('view-home').classList.add('active');
        this._setActiveNav('home');
        break;

      case 'playlist':
        if (param) {
          document.getElementById('view-playlist-detail').classList.add('active');
          this._loadPlaylistDetail(param);
        } else {
          document.getElementById('view-playlist').classList.add('active');
          this._loadPlaylists();
        }
        this._setActiveNav('playlist');
        break;

      case 'profile':
        if (!Auth.isLoggedIn()) {
          this.navigate('auth');
          return;
        }
        document.getElementById('view-profile').classList.add('active');
        this._setActiveNav('profile');
        break;

      case 'auth':
        if (Auth.isLoggedIn()) {
          this.navigate('home');
          return;
        }
        document.getElementById('view-auth').classList.add('active');
        break;

      default:
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
        UI.showToast('Please log in first', 'error');
        self.navigate('auth');
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
        UI.showToast('Failed to create playlist', 'error');
      });
    });
  },

  _loadPlaylists: function () {
    var listContainer = document.getElementById('playlist-list');
    var emptyState = document.getElementById('playlist-empty');

    if (!Auth.isLoggedIn()) {
      listContainer.innerHTML = '';
      emptyState.querySelector('p').textContent = 'Login required';
      emptyState.querySelector('span').textContent = 'Please log in to view playlists';
      emptyState.style.display = 'flex';
      return;
    }

    PlaylistDB.getPlaylists().then(function (playlists) {
      listContainer.innerHTML = '';

      if (playlists.length === 0) {
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

    headerContainer.innerHTML = '';
    videosContainer.innerHTML = '';

    Promise.all([
      PlaylistDB.getPlaylist(playlistId),
      PlaylistDB.getPlaylistVideos(playlistId)
    ]).then(function (results) {
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

  refreshPlaylistDetail: function (playlistId) {
    this._loadPlaylistDetail(playlistId);
  },

  showAddToPlaylistModal: function (video) {
    var self = this;
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
            self._addVideoToPlaylist(pl.id);
          });

          container.appendChild(item);
        });
      }

      UI.showModal('modal-add-to-playlist');
    });
  },

  _addVideoToPlaylist: function (playlistId) {
    var self = this;
    if (!this.pendingVideo) return;

    PlaylistDB.addVideo(playlistId, this.pendingVideo).then(function () {
      UI.hideModal('modal-add-to-playlist');
      UI.showToast('Added to playlist!', 'success');
      self.pendingVideo = null;
    }).catch(function (err) {
      if (err.message === 'Video already in playlist') {
        UI.showToast('Already in this playlist', 'error');
      } else {
        UI.showToast('Failed to add video', 'error');
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', function () {
  App.init();
});
