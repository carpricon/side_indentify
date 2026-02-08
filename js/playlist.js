var PlaylistDB = {
  db: null,

  init: function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

      request.onupgradeneeded = function (e) {
        var db = e.target.result;

        if (!db.objectStoreNames.contains('playlists')) {
          var playlistStore = db.createObjectStore('playlists', { keyPath: 'id' });
          playlistStore.createIndex('userId', 'userId', { unique: false });
          playlistStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('playlist_videos')) {
          var videoStore = db.createObjectStore('playlist_videos', { keyPath: 'id' });
          videoStore.createIndex('playlistId', 'playlistId', { unique: false });
          videoStore.createIndex('videoId', 'videoId', { unique: false });
        }
      };

      request.onsuccess = function (e) {
        self.db = e.target.result;
        resolve();
      };

      request.onerror = function (e) {
        reject(e.target.error);
      };
    });
  },

  createPlaylist: function (name, description) {
    var self = this;
    var user = Auth.getCurrentUser();

    if (!user) {
      UI.showToast('회원만 가능합니다', 'error');
      return Promise.reject(new Error('Auth required'));
    }

    var userId = user.id;

    return this.getPlaylists().then(function (playlists) {
      var exists = playlists.some(function (pl) {
        return pl.name.toLowerCase() === name.toLowerCase();
      });

      if (exists) {
        UI.showToast('이미 존재하는 플레이리스트 이름입니다', 'error');
        return Promise.reject(new Error('Duplicate name'));
      }

      return new Promise(function (resolve, reject) {
        var tx = self.db.transaction('playlists', 'readwrite');
        var store = tx.objectStore('playlists');

        var playlist = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
          userId: userId,
          name: name,
          description: description || '',
          videoCount: 0,
          createdAt: new Date().toISOString()
        };

        var req = store.add(playlist);
        req.onsuccess = function () { resolve(playlist); };
        req.onerror = function (e) { reject(e.target.error); };
      });
    });
  },

  getPlaylists: function () {
    var self = this;
    var user = Auth.getCurrentUser();
    var userId = user ? user.id : 'guest';

    return new Promise(function (resolve, reject) {
      var tx = self.db.transaction('playlists', 'readonly');
      var store = tx.objectStore('playlists');
      var index = store.index('userId');
      var req = index.getAll(userId);

      req.onsuccess = function () {
        var playlists = req.result || [];
        playlists.sort(function (a, b) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        resolve(playlists);
      };
      req.onerror = function (e) { reject(e.target.error); };
    });
  },

  getPlaylist: function (playlistId) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var tx = self.db.transaction('playlists', 'readonly');
      var store = tx.objectStore('playlists');
      var req = store.get(playlistId);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  },

  deletePlaylist: function (playlistId) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var tx = self.db.transaction(['playlists', 'playlist_videos'], 'readwrite');
      var playlistStore = tx.objectStore('playlists');
      var videoStore = tx.objectStore('playlist_videos');
      var videoIndex = videoStore.index('playlistId');

      playlistStore.delete(playlistId);

      var cursorReq = videoIndex.openCursor(playlistId);
      cursorReq.onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = function () { resolve(); };
      tx.onerror = function (e) { reject(e.target.error); };
    });
  },

  addVideo: function (playlistId, videoData) {
    var self = this;
    return this._checkDuplicate(playlistId, videoData.videoId).then(function (exists) {
      if (exists) {
        return Promise.reject(new Error('Video already in playlist'));
      }

      return new Promise(function (resolve, reject) {
        var tx = self.db.transaction(['playlist_videos', 'playlists'], 'readwrite');
        var videoStore = tx.objectStore('playlist_videos');
        var playlistStore = tx.objectStore('playlists');

        var entry = {
          id: playlistId + '_' + videoData.videoId,
          playlistId: playlistId,
          videoId: videoData.videoId,
          title: videoData.title,
          channelTitle: videoData.channelTitle,
          thumbnailUrl: videoData.thumbnailUrl,
          duration: videoData.duration || '',
          addedAt: new Date().toISOString()
        };

        videoStore.add(entry);

        var getReq = playlistStore.get(playlistId);
        getReq.onsuccess = function () {
          var playlist = getReq.result;
          if (playlist) {
            playlist.videoCount = (playlist.videoCount || 0) + 1;
            playlistStore.put(playlist);
          }
        };

        tx.oncomplete = function () { resolve(entry); };
        tx.onerror = function (e) { reject(e.target.error); };
      });
    });
  },

  removeVideo: function (playlistId, videoId) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var tx = self.db.transaction(['playlist_videos', 'playlists'], 'readwrite');
      var videoStore = tx.objectStore('playlist_videos');
      var playlistStore = tx.objectStore('playlists');

      var key = playlistId + '_' + videoId;
      videoStore.delete(key);

      var getReq = playlistStore.get(playlistId);
      getReq.onsuccess = function () {
        var playlist = getReq.result;
        if (playlist) {
          playlist.videoCount = Math.max(0, (playlist.videoCount || 0) - 1);
          playlistStore.put(playlist);
        }
      };

      tx.oncomplete = function () { resolve(); };
      tx.onerror = function (e) { reject(e.target.error); };
    });
  },

  getPlaylistVideos: function (playlistId) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var tx = self.db.transaction('playlist_videos', 'readonly');
      var store = tx.objectStore('playlist_videos');
      var index = store.index('playlistId');
      var req = index.getAll(playlistId);

      req.onsuccess = function () {
        var videos = req.result || [];
        videos.sort(function (a, b) {
          return new Date(b.addedAt) - new Date(a.addedAt);
        });
        resolve(videos);
      };
      req.onerror = function (e) { reject(e.target.error); };
    });
  },

  _checkDuplicate: function (playlistId, videoId) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var tx = self.db.transaction('playlist_videos', 'readonly');
      var store = tx.objectStore('playlist_videos');
      var key = playlistId + '_' + videoId;
      var req = store.get(key);
      req.onsuccess = function () { resolve(!!req.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }
};
