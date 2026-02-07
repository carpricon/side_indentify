const UI = {
  renderVideoCard(video) {
    const duration = video.duration ? this.formatDuration(video.duration) : '';
    const thumbnail = video.thumbnailUrl || '';

    const card = document.createElement('div');
    card.className = 'video-card';
    card.innerHTML =
      '<div class="thumbnail">' +
        '<img src="' + thumbnail + '" alt="" loading="lazy">' +
        (duration ? '<span class="duration-badge">' + duration + '</span>' : '') +
      '</div>' +
      '<div class="video-info">' +
        '<div class="video-title">' + this.escapeHtml(video.title) + '</div>' +
        '<div class="video-channel">' + this.escapeHtml(video.channelTitle) + '</div>' +
        '<div class="video-actions">' +
          '<button class="btn-add-video" data-video-id="' + video.videoId + '" aria-label="Add to playlist">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<line x1="12" y1="5" x2="12" y2="19"></line>' +
              '<line x1="5" y1="12" x2="19" y2="12"></line>' +
            '</svg>' +
          '</button>' +
        '</div>' +
      '</div>';

    card.querySelector('.thumbnail').addEventListener('click', function () {
      Player.playNow(video);
    });

    card.querySelector('.btn-add-video').addEventListener('click', function (e) {
      e.stopPropagation();
      if (!Auth.isLoggedIn()) {
        UI.showToast('로그인이 필요합니다', 'error');
        return;
      }
      App.showAddToPlaylistModal(video);
    });

    return card;
  },

  renderPlaylistCard(playlist) {
    const card = document.createElement('div');
    card.className = 'playlist-card';
    card.setAttribute('data-id', playlist.id);
    card.innerHTML =
      '<div class="playlist-icon">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M9 18V5l12-2v13"></path>' +
          '<circle cx="6" cy="18" r="3"></circle>' +
          '<circle cx="18" cy="16" r="3"></circle>' +
        '</svg>' +
      '</div>' +
      '<div class="playlist-info">' +
        '<div class="playlist-name">' + this.escapeHtml(playlist.name) + '</div>' +
        '<div class="playlist-meta">' + (playlist.videoCount || 0) + ' videos</div>' +
      '</div>' +
      '<div class="playlist-arrow">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<polyline points="9 18 15 12 9 6"></polyline>' +
        '</svg>' +
      '</div>';

    card.addEventListener('click', function () {
      App.navigate('playlist/' + playlist.id);
    });

    return card;
  },

  renderPlaylistDetailHeader(playlist) {
    const header = document.createElement('div');
    header.className = 'playlist-detail-header';
    header.innerHTML =
      '<button class="detail-back">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<polyline points="15 18 9 12 15 6"></polyline>' +
        '</svg>' +
        'Back' +
      '</button>' +
      '<div class="detail-title">' + this.escapeHtml(playlist.name) + '</div>' +
      (playlist.description ? '<div class="detail-desc">' + this.escapeHtml(playlist.description) + '</div>' : '') +
      '<div class="detail-count">' + (playlist.videoCount || 0) + ' videos</div>' +
      '<div class="detail-actions">' +
        '<button class="btn-danger" data-playlist-id="' + playlist.id + '">Delete playlist</button>' +
      '</div>';

    header.querySelector('.detail-back').addEventListener('click', function () {
      App.navigate('playlist');
    });

    header.querySelector('.btn-danger').addEventListener('click', function () {
      if (confirm('Are you sure you want to delete this playlist?')) {
        PlaylistDB.deletePlaylist(playlist.id).then(function () {
          UI.showToast('Playlist deleted', 'success');
          App.navigate('playlist');
        });
      }
    });

    return header;
  },

  renderPlaylistVideoItem(video, playlistId) {
    const item = document.createElement('div');
    item.className = 'playlist-video-item';
    item.innerHTML =
      '<div class="pv-thumbnail">' +
        '<img src="' + (video.thumbnailUrl || '') + '" alt="" loading="lazy">' +
      '</div>' +
      '<div class="pv-info">' +
        '<div class="pv-title">' + this.escapeHtml(video.title) + '</div>' +
        '<div class="pv-channel">' + this.escapeHtml(video.channelTitle) + '</div>' +
      '</div>' +
      '<button class="btn-remove" aria-label="Remove">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<line x1="18" y1="6" x2="6" y2="18"></line>' +
          '<line x1="6" y1="6" x2="18" y2="18"></line>' +
        '</svg>' +
      '</button>';

    item.querySelector('.pv-thumbnail').addEventListener('click', function () {
      Player.playNow(video);
    });

    item.querySelector('.btn-remove').addEventListener('click', function () {
      PlaylistDB.removeVideo(playlistId, video.videoId).then(function () {
        item.remove();
        UI.showToast('Removed from playlist', 'success');
        App.refreshPlaylistDetail(playlistId);
      });
    });

    return item;
  },

  showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    var toast = document.createElement('div');
    toast.className = 'toast' + (type !== 'info' ? ' toast-' + type : '');
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(function () {
      toast.classList.add('toast-out');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3000);
  },

  showModal(modalId) {
    var modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  },

  hideModal(modalId) {
    var modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  },

  formatDuration(iso) {
    if (!iso) return '';
    var match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '';
    var h = parseInt(match[1] || '0', 10);
    var m = parseInt(match[2] || '0', 10);
    var s = parseInt(match[3] || '0', 10);

    if (h > 0) {
      return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    return m + ':' + String(s).padStart(2, '0');
  },

  parseDurationToSeconds(iso) {
    if (!iso) return 0;
    var match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    var h = parseInt(match[1] || '0', 10);
    var m = parseInt(match[2] || '0', 10);
    var s = parseInt(match[3] || '0', 10);
    return h * 3600 + m * 60 + s;
  },

  showLoading() {
    var el = document.getElementById('search-loading');
    if (el) el.style.display = 'flex';
  },

  hideLoading() {
    var el = document.getElementById('search-loading');
    if (el) el.style.display = 'none';
  },

  renderEmptyState(container, message, sub) {
    container.innerHTML = '';
    var empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML =
      '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="12" cy="12" r="10"></circle>' +
        '<line x1="8" y1="15" x2="16" y2="15"></line>' +
        '<line x1="9" y1="9" x2="9.01" y2="9"></line>' +
        '<line x1="15" y1="9" x2="15.01" y2="9"></line>' +
      '</svg>' +
      '<p>' + message + '</p>' +
      (sub ? '<span>' + sub + '</span>' : '');
    container.appendChild(empty);
  },

  renderPagination(container, currentPage, totalPages, onPageClick) {
    container.innerHTML = '';
    if (totalPages <= 1) return;

    var start = Math.max(1, currentPage - 2);
    var end = Math.min(totalPages, currentPage + 2);

    if (currentPage > 1) {
      var prev = document.createElement('button');
      prev.className = 'page-btn';
      prev.textContent = '<';
      prev.addEventListener('click', function () { onPageClick(currentPage - 1); });
      container.appendChild(prev);
    }

    for (var i = start; i <= end; i++) {
      var btn = document.createElement('button');
      btn.className = 'page-btn' + (i === currentPage ? ' active' : '');
      btn.textContent = i;
      (function (page) {
        btn.addEventListener('click', function () { onPageClick(page); });
      })(i);
      container.appendChild(btn);
    }

    if (currentPage < totalPages) {
      var next = document.createElement('button');
      next.className = 'page-btn';
      next.textContent = '>';
      next.addEventListener('click', function () { onPageClick(currentPage + 1); });
      container.appendChild(next);
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
