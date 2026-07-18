<template>
  <div class="app-root">

    <!-- TOP BAR -->
    <header class="topbar">
      <div class="topbar-left">
        <!-- Mobile: hamburger -->
        <button class="icon-btn mobile-menu-btn" @click="sidebarOpen = !sidebarOpen" aria-label="Menu">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
        </button>
        <div class="logo-area">
          <div class="logo-mark">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 14V7l6-5 6 5v7H2z" stroke="#1a0a1a" stroke-width="1.4" fill="none"/>
              <rect x="5.5" y="9" width="5" height="5" rx="0.5" fill="#1a0a1a"/>
            </svg>
          </div>
          <span class="logo-name">Hymn</span>
        </div>
      </div>
      <div class="topbar-right">
        <span class="topbar-label">{{ currentUser ? (currentUser.displayName || currentUser.username) : 'TOP - Multimedia Team' }}</span>
        <div class="avatar">{{ userInitials }}</div>
        <!-- Logout button -->
        <button class="icon-btn logout-btn" @click="logout" title="Logout" aria-label="Logout">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 3H3v10h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M6 8h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M10 5l3 3-3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- LOADING / ERROR STATE -->
    <div v-if="isLoading && !songs.length && !schedules.length" class="empty-state" style="margin: auto;">
      <p>Loading your songs and schedules…</p>
    </div>
    <div v-else-if="loadError" class="empty-state" style="margin: auto;">
      <p>{{ loadError }}</p>
      <button class="btn btn-accent btn-sm" style="margin-top: 12px;" @click="loadInitialData">Retry</button>
    </div>

    <!-- APP BODY -->
    <div v-else class="app-body">

      <!-- Sidebar overlay (mobile) -->
      <div
        v-if="sidebarOpen"
        class="sidebar-overlay"
        @click="sidebarOpen = false"
      ></div>

      <!-- SIDEBAR -->
      <nav class="sidebar" :class="{ 'sidebar-open': sidebarOpen }">
        <!-- Mobile close -->
        <button class="icon-btn sidebar-close-btn" @click="sidebarOpen = false" aria-label="Close menu">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
        </button>

        <div class="nav-section-label">Manage</div>
        <div
          class="nav-item"
          :class="{ active: currentView === 'library' }"
          @click="navigate('library')"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M3 2h10v12H3z" stroke="currentColor" stroke-width="1.2"/>
            <path d="M5 5h6M5 8h4" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
          </svg>
          Song Library
        </div>
        <div
          class="nav-item"
          :class="{ active: currentView === 'schedules' }"
          @click="navigate('schedules')"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
            <path d="M5 1v3M11 1v3M2 6h12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          Schedules
        </div>
        <div class="divider"></div>
        <div class="nav-section-label">Quick add</div>
        <div class="nav-item" @click="openSongModal(); sidebarOpen = false">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          New Song
        </div>
        <div class="nav-item" @click="openScheduleModal(); sidebarOpen = false">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          New Schedule
        </div>

        <div class="divider"></div>
        <div class="nav-section-label">Account</div>
        <div class="nav-item logout-nav-item" @click="logout">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M6 3H3v10h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M6 8h7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M10 5l3 3-3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Logout
        </div>
      </nav>

      <!-- MAIN -->
      <div class="main">

        <!-- ===== LIBRARY VIEW ===== -->
        <div v-if="currentView === 'library'" class="view-container">

          <!-- List column -->
          <div class="panel list-panel" :class="{ 'panel-hidden-mobile': mobileDetailOpen && currentView === 'library' }">
            <div class="panel-header">
              <span class="panel-title">Song Library</span>
              <button class="btn btn-accent btn-sm" @click="openSongModal()">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <span class="btn-label">Add Song</span>
              </button>
            </div>
            <div class="panel-body">
              <div class="search-wrap">
                <svg class="search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2"/>
                  <path d="M10 10l2.5 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
                <input type="text" v-model="songSearch" placeholder="Search songs…"/>
              </div>
              <div class="song-list">
                <div
                  v-for="song in filteredSongs"
                  :key="song.id"
                  class="song-row"
                  :class="{ active: selectedSongId === song.id }"
                  @click="selectSong(song.id)"
                >
                  <div class="song-row-info">
                    <div class="song-row-title">{{ song.title }}</div>
                    <div class="song-row-meta">
                      {{ song.artist || 'Unknown artist' }}
                    </div>
                  </div>
                  <div class="song-row-actions">
                    <button class="icon-btn" @click.stop="editSong(song.id)" title="Edit">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M9 2l2 2-7 7H2v-2L9 2z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
                      </svg>
                    </button>
                    <button class="icon-btn danger" @click.stop="deleteSong(song.id)" title="Delete">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M2 3.5h9M5 3.5V2h3v1.5M10 3.5l-.7 7.5H3.7L3 3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div v-if="songs.length === 0" class="empty-list-msg">
                  <div class="empty-list-icon">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <path d="M6 5h16v18H6z" stroke="currentColor" stroke-width="1.2"/>
                      <path d="M10 10h8M10 14h5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
                    </svg>
                  </div>
                  <p>No songs yet</p>
                  <button class="btn btn-accent btn-sm" @click="openSongModal()">Add your first song</button>
                </div>
                <div v-else-if="filteredSongs.length === 0" class="empty-list-msg">
                  <p>No results for "{{ songSearch }}"</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Detail column -->
          <div
            class="panel detail-panel"
            :class="{ 'panel-active-mobile': mobileDetailOpen && currentView === 'library' }"
          >
            <!-- Mobile back button -->
            <button v-if="mobileDetailOpen" class="mobile-back-btn" @click="mobileDetailOpen = false">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              All Songs
            </button>

            <!-- Empty state -->
            <div v-if="!selectedSong" class="empty-state">
              <div class="empty-icon">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M5 4h12v14H5z" stroke="rgba(232,226,232,0.25)" stroke-width="1.3"/>
                  <path d="M8 8h6M8 11h4" stroke="rgba(232,226,232,0.25)" stroke-width="1.1" stroke-linecap="round"/>
                </svg>
              </div>
              <p>Select a song to view<br>its lyrics and details</p>
            </div>

            <!-- Song detail -->
            <div v-else class="song-detail">
              <div class="song-detail-header">
                <div class="song-detail-title-group">
                  <div class="song-detail-name">{{ selectedSong.title }}</div>
                  <div class="song-detail-artist">{{ selectedSong.artist || 'Unknown artist' }}</div>
                  <div v-if="selectedSong.category" style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
                    <span class="badge badge-pink">{{ categoryLabel(selectedSong.category) }}</span>
                  </div>
                </div>
                <div class="detail-actions">
                  <button class="btn btn-subtle btn-sm" @click="editSong(selectedSongId)">Edit</button>
                  <button class="btn btn-outline btn-sm delete-btn" @click="deleteSong(selectedSongId)">Delete</button>
                </div>
              </div>
              <div class="song-detail-body">
                <div class="lyrics-label">Lyrics</div>
                <div v-if="selectedSong.lyrics" class="lyrics-text">{{ selectedSong.lyrics }}</div>
                <div v-else class="no-lyrics">No lyrics added yet.
                  <button class="inline-link" @click="editSong(selectedSongId)">Add lyrics →</button>
                </div>
              </div>
              <div class="song-detail-footer">
                <button class="btn btn-accent btn-sm" @click="addSelectedSongToSchedule()">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <rect x="1" y="1" width="10" height="10" rx="1" stroke="currentColor" stroke-width="1.1"/>
                    <path d="M6 4v4M4 6h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                  </svg>
                  Add to Schedule
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ===== SCHEDULES VIEW ===== -->
        <div v-if="currentView === 'schedules'" class="view-container">

          <!-- List column -->
          <div class="panel list-panel" :class="{ 'panel-hidden-mobile': mobileDetailOpen && currentView === 'schedules' }">
            <div class="panel-header">
              <span class="panel-title">Schedules</span>
              <button class="btn btn-accent btn-sm" @click="openScheduleModal()">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <span class="btn-label">New</span>
              </button>
            </div>
            <div class="panel-body">
              <div class="schedules-list">
                <div
                  v-for="sched in schedules"
                  :key="sched.id"
                  class="schedule-card"
                  :class="{ active: selectedSchedId === sched.id }"
                  @click="selectSchedule(sched.id)"
                >
                  <div class="schedule-card-title">{{ sched.name }}</div>
                  <div class="schedule-card-meta">
                    {{ formatDate(sched.date) }}<span v-if="sched.service_time"> · {{ sched.service_time }}</span>
                  </div>
                  <div class="schedule-songs-count">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 2h6v6H2z" stroke="currentColor" stroke-width="1"/>
                    </svg>
                    {{ sched.song_count }} song{{ sched.song_count !== 1 ? 's' : '' }}
                  </div>
                </div>
                <div v-if="schedules.length === 0" class="empty-list-msg">
                  <div class="empty-list-icon">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <rect x="3" y="4" width="22" height="20" rx="2" stroke="currentColor" stroke-width="1.2"/>
                      <path d="M9 3v4M19 3v4M3 12h22" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
                    </svg>
                  </div>
                  <p>No schedules yet</p>
                  <button class="btn btn-accent btn-sm" @click="openScheduleModal()">Create a schedule</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Schedule detail column -->
          <div
            class="panel detail-panel"
            :class="{ 'panel-active-mobile': mobileDetailOpen && currentView === 'schedules' }"
          >
            <!-- Mobile back button -->
            <button v-if="mobileDetailOpen" class="mobile-back-btn" @click="mobileDetailOpen = false">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              All Schedules
            </button>

            <!-- Empty state -->
            <div v-if="!selectedSchedule" class="empty-state">
              <div class="empty-icon">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <rect x="3" y="3" width="16" height="16" rx="2" stroke="rgba(232,226,232,0.25)" stroke-width="1.3"/>
                  <path d="M7 2v4M15 2v4M3 9h16" stroke="rgba(232,226,232,0.25)" stroke-width="1.1" stroke-linecap="round"/>
                </svg>
              </div>
              <p>Select a schedule to manage<br>its songs and order</p>
            </div>

            <!-- Schedule detail -->
            <div v-else class="schedule-detail">
              <div class="schedule-detail-header">
                <div>
                  <div class="schedule-detail-name">{{ selectedSchedule.name }}</div>
                  <div class="schedule-detail-date">
                    {{ formatDate(selectedSchedule.date) }}<span v-if="selectedSchedule.service_time"> · {{ selectedSchedule.service_time }}</span>
                  </div>
                  <div v-if="selectedSchedule.description" style="font-size:12px; color:#8a7e8a; margin-top:4px;">
                    {{ selectedSchedule.description }}
                  </div>
                </div>
                <div class="detail-actions">
                  <span class="badge badge-pink">{{ selectedSchedule.status }}</span>
                  <span class="badge badge-pink">
                    {{ selectedScheduleSongs.length }} song{{ selectedScheduleSongs.length !== 1 ? 's' : '' }}
                  </span>
                  <button class="btn btn-outline btn-sm delete-btn" @click="deleteSelectedSchedule()">Delete</button>
                </div>
              </div>
              <div class="panel-body sched-songs-body">
                <div class="schedule-songs">
                  <div
                    v-for="(item, index) in selectedScheduleSongs"
                    :key="item.song_id"
                    class="sched-song-item"
                    :class="{ 'sched-song-expanded': expandedSongId === item.song_id }"
                  >
                    <!-- Top row: number, info, controls -->
                    <div class="sched-song-row">
                      <div class="sched-song-num">{{ index + 1 }}</div>
                      <div class="sched-song-info" @click="toggleLyrics(item.song_id)" style="cursor:pointer; flex:1;">
                        <div class="sched-song-title">{{ item.title }}</div>
                        <div class="sched-song-artist">
                          {{ item.artist || 'Unknown artist' }}
                        </div>
                        <div v-if="item.notes" style="font-size:11px; color:#8a7e8a; margin-top:2px;">{{ item.notes }}</div>
                      </div>
                      <!-- Expand toggle -->
                      <button
                        class="icon-btn lyrics-toggle-btn"
                        :class="{ active: expandedSongId === item.song_id }"
                        @click="toggleLyrics(item.song_id)"
                        :title="expandedSongId === item.song_id ? 'Hide lyrics' : 'Show lyrics'"
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path
                            :d="expandedSongId === item.song_id
                              ? 'M2 8.5l4.5-4.5 4.5 4.5'
                              : 'M2 4.5l4.5 4.5 4.5-4.5'"
                            stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </button>
                      <div class="drag-handle" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <circle cx="4" cy="3" r="1" fill="currentColor"/>
                          <circle cx="8" cy="3" r="1" fill="currentColor"/>
                          <circle cx="4" cy="6" r="1" fill="currentColor"/>
                          <circle cx="8" cy="6" r="1" fill="currentColor"/>
                          <circle cx="4" cy="9" r="1" fill="currentColor"/>
                          <circle cx="8" cy="9" r="1" fill="currentColor"/>
                        </svg>
                      </div>
                      <button class="icon-btn danger" @click="removeSongFromSchedule(item.song_id)" title="Remove">
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M2 3.5h9M5 3.5V2h3v1.5M10 3.5l-.7 7.5H3.7L3 3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
                        </svg>
                      </button>
                    </div>

                    <!-- Lyrics panel — expands below when toggled -->
                    <Transition name="lyrics-expand">
                      <div
                        v-if="expandedSongId === item.song_id"
                        class="sched-song-lyrics"
                      >
                        <div v-if="item.lyrics" class="lyrics-text">{{ item.lyrics }}</div>
                        <div v-else class="no-lyrics">No lyrics added for this song.</div>
                      </div>
                    </Transition>
                  </div>
                </div>
                <div v-if="selectedScheduleSongs.length === 0" class="empty-list-msg" style="padding: 32px 0;">
                  No songs added yet
                </div>
              </div>
              <div class="add-song-bar">
                <!-- Row 1: dropdown + Add button (always visible together) -->
                <div class="add-song-bar-row">
                  <select class="add-song-select" v-model="addSongSelectValue">
                    <option value="">— Select a song to add —</option>
                    <option
                      v-for="song in availableSongsForSchedule"
                      :key="song.id"
                      :value="song.id"
                    >{{ song.title }}{{ song.artist ? ' — ' + song.artist : '' }}</option>
                  </select>
                  <button class="btn btn-accent btn-sm" @click="addSongToSchedule()" style="flex-shrink:0;">Add</button>
                </div>
                <!-- Row 2: optional notes -->
                <input
                  class="add-song-notes"
                  type="text"
                  v-model="addSongNotes"
                  placeholder="Notes (optional)"
                />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- ===== MODALS ===== -->

    <!-- Add / Edit Song Modal -->
    <Transition name="modal">
      <div v-if="showSongModal" class="modal-overlay" @click.self="closeSongModal()">
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">{{ editingSongId ? 'Edit Song' : 'Add New Song' }}</span>
            <button class="icon-btn" @click="closeSongModal()">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div>
              <div class="field-label">Song Title *</div>
              <input
                class="field-input"
                :class="{ 'field-input-error': songFormError }"
                type="text"
                v-model="songForm.title"
                placeholder="e.g. Way Maker"
                ref="songTitleInput"
              />
              <div v-if="songFormError" class="field-error">Title is required</div>
            </div>
            <div>
              <div class="field-label">Artist / Songwriter</div>
              <input class="field-input" type="text" v-model="songForm.artist" placeholder="e.g. Sinach"/>
            </div>

            <div>
              <div class="field-label">Category</div>
              <select class="field-input" v-model="songForm.category">
                <option value="praise_worship">Praise &amp; Worship</option>
                <option value="solemn">Solemn</option>
                <option value="devotion">Devotion</option>
              </select>
            </div>

            <div>
              <div class="field-label">Lyrics</div>
              <textarea
                class="field-input"
                v-model="songForm.lyrics"
                placeholder="Paste or type lyrics here…&#10;&#10;Use blank lines to separate verses and choruses."
              ></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" @click="closeSongModal()">Cancel</button>
            <button class="btn btn-accent" @click="saveSong()" :disabled="isSavingSong">
              {{ isSavingSong ? 'Saving…' : 'Save Song' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Add Schedule Modal -->
    <Transition name="modal">
      <div v-if="showScheduleModal" class="modal-overlay" @click.self="closeScheduleModal()">
        <div class="modal modal-sm">
          <div class="modal-header">
            <span class="modal-title">New Schedule</span>
            <button class="icon-btn" @click="closeScheduleModal()">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div>
              <div class="field-label">Schedule Name *</div>
              <input
                class="field-input"
                :class="{ 'field-input-error': schedFormError }"
                type="text"
                v-model="schedForm.name"
                placeholder="e.g. Sunday Morning Service"
              />
              <div v-if="schedFormError" class="field-error">Name is required</div>
            </div>
            <div style="display:flex; gap:12px;">
              <div style="flex:1;">
                <div class="field-label">Date</div>
                <input class="field-input" type="date" v-model="schedForm.date"/>
              </div>
              <div style="flex:1;">
                <div class="field-label">Service Time</div>
                <input class="field-input" type="text" v-model="schedForm.service_time" placeholder="e.g. 9:00 AM"/>
              </div>
            </div>
            <div>
              <div class="field-label">Status</div>
              <select class="field-input" v-model="schedForm.status">
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
                <option value="live">Live</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <div class="field-label">Description</div>
              <input class="field-input" type="text" v-model="schedForm.description" placeholder="Optional notes about this service"/>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" @click="closeScheduleModal()">Cancel</button>
            <button class="btn btn-accent" @click="saveSchedule()" :disabled="isSavingSchedule">
              {{ isSavingSchedule ? 'Creating…' : 'Create Schedule' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Pick Schedule Modal -->
    <Transition name="modal">
      <div v-if="showPickScheduleModal" class="modal-overlay" @click.self="showPickScheduleModal = false">
        <div class="modal modal-sm">
          <div class="modal-header">
            <span class="modal-title">Add to Schedule</span>
            <button class="icon-btn" @click="showPickScheduleModal = false">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="modal-body pick-schedule-body">
            <div
              v-for="sched in schedules"
              :key="sched.id"
              class="schedule-card pick-card"
              @click="confirmAddToSchedule(sched.id)"
            >
              <div class="schedule-card-title">{{ sched.name }}</div>
              <div class="schedule-card-meta">{{ formatDate(sched.date) }}</div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <div class="toast" :class="{ show: toastVisible }">{{ toastMessage }}</div>

  </div>
</template>

<script>
// API_BASE: same-origin "/api" by default. Set VITE_API_URL in the
// frontend's .env only if backend and frontend are deployed on different
// origins (see backend README for the same-origin-vs-not tradeoffs).
const API_BASE = import.meta.env.VITE_API_URL || '/api';

export default {
  name: 'FlowApp',

  data() {
    return {
      currentView: 'library',

      // Server-backed state
      songs: [],
      schedules: [], // { id, name, date, description, status, service_time, song_count }
      scheduleDetails: {}, // schedule_id -> { schedule, songs: [{song_id, position, notes, title, artist, key_signature, tempo}] }

      selectedSongId: null,
      selectedSchedId: null,

      // Auth / loading state
      currentUser: null,
      isLoading: true,
      loadError: '',
      isSavingSong: false,
      isSavingSchedule: false,

      // UI
      sidebarOpen: false,
      mobileDetailOpen: false,
      songSearch: '',
      addSongSelectValue: '',
      addSongNotes: '',
      expandedSongId: null,

      // Modals
      showSongModal: false,
      showScheduleModal: false,
      showPickScheduleModal: false,
      editingSongId: null,

      // Forms — field names match the songs / schedules table columns
      // directly, so there's no translation layer between the UI and
      // what gets sent to the API.
      songForm: {
        title: '', artist: '', lyrics: '', category: 'praise_worship',
      },
      schedForm: { name: '', date: '', description: '', service_time: '', status: 'draft' },
      songFormError: false,
      schedFormError: false,

      // Toast
      toastMessage: '',
      toastVisible: false,
      toastTimer: null,
    };
  },

  computed: {
    filteredSongs() {
      const q = this.songSearch.trim().toLowerCase();
      if (!q) return this.songs;
      return this.songs.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.artist || '').toLowerCase().includes(q)
      );
    },

    selectedSong() {
      return this.songs.find((s) => s.id === this.selectedSongId) ?? null;
    },

    selectedSchedule() {
      return this.schedules.find((s) => s.id === this.selectedSchedId) ?? null;
    },

    selectedScheduleSongs() {
      return this.scheduleDetails[this.selectedSchedId]?.songs ?? [];
    },

    availableSongsForSchedule() {
      if (!this.selectedSchedId) return [];
      const usedIds = new Set(this.selectedScheduleSongs.map((s) => s.song_id));
      return this.songs.filter((s) => !usedIds.has(s.id));
    },

    userInitials() {
      const name = this.currentUser?.displayName || this.currentUser?.username || 'TOP';
      return name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('');
    },
  },

  async mounted() {
    // Restore non-sensitive display info immediately so the topbar
    // doesn't flash the default placeholder while /auth/me resolves.
    const cached = sessionStorage.getItem('hymn_user');
    if (cached) {
      try { this.currentUser = JSON.parse(cached); } catch { /* ignore bad cache */ }
    }

    // The only thing that actually proves a session is valid is asking the
    // server, since the session cookie is httpOnly and unreadable here.
    const sessionOk = await this.verifySession();
    if (!sessionOk) {
      this.$router.push('/login');
      return;
    }

    await this.loadInitialData();
  },

  beforeUnmount() {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  },

  methods: {
    // ── Toast ──
    showToast(msg) {
      this.toastMessage = msg;
      this.toastVisible = true;
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        this.toastVisible = false;
      }, 3200);
    },

    showFetchError(err) {
      console.error(err);
      this.showToast(err.message || 'Something went wrong. Please try again.');
    },

    // ── Auth ──
    async verifySession() {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
        if (!res.ok) return false;
        const data = await res.json();
        this.currentUser = data.user;
        sessionStorage.setItem('hymn_user', JSON.stringify(data.user));
        return true;
      } catch (err) {
        console.error('Session check failed:', err);
        return false;
      }
    },

    async logout() {
      try {
        await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
      } catch (err) {
        // Even if the request fails, still clear local state and leave —
        // we don't want a network hiccup to trap someone on this screen.
        console.error('Logout request failed:', err);
      }
      sessionStorage.removeItem('hymn_user');
      this.$router.push('/login');
    },

    // ── Navigation ──
    navigate(view) {
      this.currentView = view;
      this.mobileDetailOpen = false;
      this.sidebarOpen = false;
      if (view === 'library') {
        this.selectedSchedId = null;
      } else if (view === 'schedules') {
        this.selectedSongId = null;
      }
    },

    // ── Data loading ──
    async loadInitialData() {
      this.isLoading = true;
      this.loadError = '';
      try {
        const [songsRes, schedulesRes] = await Promise.all([
          fetch(`${API_BASE}/songs`, { credentials: 'include' }),
          fetch(`${API_BASE}/schedules`, { credentials: 'include' }),
        ]);

        if (songsRes.status === 401 || schedulesRes.status === 401) {
          this.$router.push('/login');
          return;
        }

        const songsData = await songsRes.json();
        const schedulesData = await schedulesRes.json();

        if (!songsRes.ok) throw new Error(songsData.error || 'Could not load songs');
        if (!schedulesRes.ok) throw new Error(schedulesData.error || 'Could not load schedules');

        this.songs = songsData.songs;
        this.schedules = schedulesData.schedules;
      } catch (err) {
        this.loadError = err.message || 'Could not load your data. Check your connection and try again.';
      } finally {
        this.isLoading = false;
      }
    },

    async refreshScheduleList() {
      try {
        const res = await fetch(`${API_BASE}/schedules`, { credentials: 'include' });
        const data = await res.json();
        if (res.ok) this.schedules = data.schedules;
      } catch (err) {
        console.error('Could not refresh schedules:', err);
      }
    },

    async loadScheduleDetail(id) {
      try {
        const res = await fetch(`${API_BASE}/schedules/${id}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load schedule');
        this.scheduleDetails = { ...this.scheduleDetails, [id]: data };
      } catch (err) {
        this.showFetchError(err);
      }
    },

    // ── Selection ──
    selectSong(id) {
      this.selectedSongId = id;
      this.mobileDetailOpen = true;
    },

    async selectSchedule(id) {
      this.selectedSchedId = id;
      this.mobileDetailOpen = true;
      this.addSongSelectValue = '';
      this.addSongNotes = '';
      this.expandedSongId = null;
      await this.loadScheduleDetail(id);
    },

    // ── Song CRUD ──
    openSongModal() {
      this.editingSongId = null;
      this.songForm = { title: '', artist: '', lyrics: '', category: 'praise_worship' };
      this.songFormError = false;
      this.showSongModal = true;
    },

    closeSongModal() {
      this.showSongModal = false;
      this.editingSongId = null;
      this.songFormError = false;
    },

    async saveSong() {
      if (!this.songForm.title.trim()) {
        this.songFormError = true;
        return;
      }
      this.songFormError = false;
      this.isSavingSong = true;

      const payload = {
        title: this.songForm.title.trim(),
        artist: this.songForm.artist.trim(),
        lyrics: this.songForm.lyrics.trim(),
        category: this.songForm.category,
      };

      try {
        const url = this.editingSongId ? `${API_BASE}/songs/${this.editingSongId}` : `${API_BASE}/songs`;
        const res = await fetch(url, {
          method: this.editingSongId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not save song');

        if (this.editingSongId) {
          const idx = this.songs.findIndex((s) => s.id === this.editingSongId);
          if (idx !== -1) this.songs.splice(idx, 1, data.song);
        } else {
          this.songs.push(data.song);
          this.songs.sort((a, b) => a.title.localeCompare(b.title));
          this.selectedSongId = data.song.id;
          this.currentView = 'library';
          this.mobileDetailOpen = true;
        }
        this.closeSongModal();
      } catch (err) {
        this.showFetchError(err);
      } finally {
        this.isSavingSong = false;
      }
    },

    editSong(id) {
      const song = this.songs.find((s) => s.id === id);
      if (!song) return;
      this.editingSongId = id;
      this.songForm = {
        title: song.title,
        artist: song.artist || '',
        lyrics: song.lyrics || '',
        category: song.category || 'praise_worship',
      };
      this.songFormError = false;
      this.showSongModal = true;
    },

    async deleteSong(id) {
      if (!confirm('Delete this song? It will also be removed from all schedules.')) return;
      try {
        const res = await fetch(`${API_BASE}/songs/${id}`, { method: 'DELETE', credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not delete song');

        this.songs = this.songs.filter((s) => s.id !== id);

        // The DB cascades the delete into schedule_songs, so refresh
        // cached schedule detail/counts rather than trying to patch them
        // by hand.
        this.scheduleDetails = {};
        await this.refreshScheduleList();
        if (this.selectedSchedId) await this.loadScheduleDetail(this.selectedSchedId);

        if (this.selectedSongId === id) {
          this.selectedSongId = null;
          this.mobileDetailOpen = false;
        }
      } catch (err) {
        this.showFetchError(err);
      }
    },

    // ── Schedule CRUD ──
    openScheduleModal() {
      this.schedForm = { name: '', date: '', description: '', service_time: '', status: 'draft' };
      this.schedFormError = false;
      this.showScheduleModal = true;
    },

    closeScheduleModal() {
      this.showScheduleModal = false;
      this.schedFormError = false;
    },

    async saveSchedule() {
      if (!this.schedForm.name.trim()) {
        this.schedFormError = true;
        return;
      }
      this.schedFormError = false;
      this.isSavingSchedule = true;

      try {
        const res = await fetch(`${API_BASE}/schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: this.schedForm.name.trim(),
            date: this.schedForm.date,
            description: this.schedForm.description.trim(),
            service_time: this.schedForm.service_time.trim(),
            status: this.schedForm.status,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not create schedule');

        this.schedules.push({ ...data.schedule, song_count: 0 });
        this.scheduleDetails = { ...this.scheduleDetails, [data.schedule.id]: { schedule: data.schedule, songs: [] } };
        this.selectedSchedId = data.schedule.id;
        this.closeScheduleModal();
        this.currentView = 'schedules';
        this.mobileDetailOpen = true;
      } catch (err) {
        this.showFetchError(err);
      } finally {
        this.isSavingSchedule = false;
      }
    },

    async deleteSelectedSchedule() {
      if (!this.selectedSchedId) return;
      if (!confirm('Delete this schedule?')) return;
      const id = this.selectedSchedId;
      try {
        const res = await fetch(`${API_BASE}/schedules/${id}`, { method: 'DELETE', credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not delete schedule');

        this.schedules = this.schedules.filter((s) => s.id !== id);
        const rest = { ...this.scheduleDetails };
        delete rest[id];
        this.scheduleDetails = rest;
        this.selectedSchedId = null;
        this.mobileDetailOpen = false;
      } catch (err) {
        this.showFetchError(err);
      }
    },

    // ── Schedule ↔ Song linking ──
    addSelectedSongToSchedule() {
      if (!this.selectedSongId) return;
      if (this.schedules.length === 0) {
        this.openScheduleModal();
        return;
      }
      this.showPickScheduleModal = true;
    },

    async confirmAddToSchedule(schedId) {
      if (!this.selectedSongId) return;
      await this.addSongToScheduleApi(schedId, this.selectedSongId);
      this.showPickScheduleModal = false;
      this.selectedSchedId = schedId;
      this.currentView = 'schedules';
      this.mobileDetailOpen = true;
    },

    async addSongToSchedule() {
      const songId = Number(this.addSongSelectValue);
      if (!songId || !this.selectedSchedId) return;
      await this.addSongToScheduleApi(this.selectedSchedId, songId, this.addSongNotes);
      this.addSongSelectValue = '';
      this.addSongNotes = '';
    },

    async addSongToScheduleApi(schedId, songId, notes = '') {
      try {
        const res = await fetch(`${API_BASE}/schedules/${schedId}/songs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ song_id: songId, notes }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not add song to schedule');
        await this.loadScheduleDetail(schedId);
        await this.refreshScheduleList();
      } catch (err) {
        this.showFetchError(err);
      }
    },

    async removeSongFromSchedule(songId) {
      if (!this.selectedSchedId) return;
      try {
        const res = await fetch(`${API_BASE}/schedules/${this.selectedSchedId}/songs/${songId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not remove song');
        await this.loadScheduleDetail(this.selectedSchedId);
        await this.refreshScheduleList();
      } catch (err) {
        this.showFetchError(err);
      }
    },

    // ── Helpers ──
    toggleLyrics(songId) {
      // Clicking the same song again collapses it; clicking a different
      // one collapses the previous and expands the new one.
      this.expandedSongId = this.expandedSongId === songId ? null : songId;
    },

    categoryLabel(value) {
      const labels = {
        praise_worship: 'Praise & Worship',
        solemn: 'Solemn',
        devotion: 'Devotion',
      };
      return labels[value] || value;
    },

    formatDate(dateStr) {
      if (!dateStr) return 'No date set';
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    },
  },
};
</script>