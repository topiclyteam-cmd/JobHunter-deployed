document.addEventListener('DOMContentLoaded', () => {
    // Session Management
    let sessionId = localStorage.getItem('jobhunter_session_id');
    if (!sessionId) {
        sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('jobhunter_session_id', sessionId);
    }

    // Navigation Tabs
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all
            navBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
            
            if (tabId === 'tracker') {
                initKanban();
            } else if (tabId === 'dashboard') {
                initDashboard();
            }
        });
    });

    // File Upload Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('cv-upload');
    const fileNameDisplay = document.getElementById('file-name-display');
    const submitBtn = document.getElementById('submit-cv-btn');
    const loadingSpinner = document.getElementById('loading-spinner');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    const profileResult = document.getElementById('profile-result');
    const uploadContainer = document.querySelector('.upload-container');

    let selectedFile = null;

    // Drag and Drop Events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length > 0) {
            const file = files[0];
            if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                selectedFile = file;
                fileNameDisplay.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> ${file.name}`;
                fileNameDisplay.classList.remove('hidden');
                submitBtn.classList.remove('hidden');
                errorMessage.classList.add('hidden');
            } else {
                showError("Please upload a PDF file only.");
                selectedFile = null;
                fileNameDisplay.classList.add('hidden');
                submitBtn.classList.add('hidden');
            }
        }
    }

    // Process CV Submit
    submitBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('session_id', sessionId);

        // UI States
        uploadContainer.classList.add('hidden');
        loadingSpinner.classList.remove('hidden');
        errorMessage.classList.add('hidden');
        profileResult.classList.add('hidden');

        try {
            const response = await fetch('/api/upload-cv', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || "Failed to process CV");
            }

            renderProfile(data.profile);

        } catch (error) {
            showError(error.message);
            uploadContainer.classList.remove('hidden');
        } finally {
            loadingSpinner.classList.add('hidden');
        }
    });

    function showError(msg) {
        errorText.textContent = msg;
        errorMessage.classList.remove('hidden');
    }

    function renderProfile(profile) {
        document.getElementById('res-name').textContent = profile.full_name || 'Name not found';
        document.getElementById('res-title').textContent = profile.current_job_title || 'Title not found';
        document.getElementById('res-summary').textContent = profile.professional_summary || 'Summary not found';
        document.getElementById('res-experience').textContent = profile.years_of_experience || '0';

        const skillsContainer = document.getElementById('res-skills');
        skillsContainer.innerHTML = '';
        
        if (profile.technical_skills && Array.isArray(profile.technical_skills) && profile.technical_skills.length > 0) {
            profile.technical_skills.forEach(skill => {
                const span = document.createElement('span');
                span.className = 'skill-tag';
                span.textContent = skill;
                skillsContainer.appendChild(span);
            });
        } else {
            skillsContainer.innerHTML = '<span class="skill-tag">No technical skills identified</span>';
        }

        profileResult.classList.remove('hidden');
    }

    // Job Feed Logic
    const fetchJobsBtn = document.getElementById('fetch-jobs-btn');
    const jobTitleInput = document.getElementById('job-title-input');
    const locationInput = document.getElementById('location-input');
    const jobFeedLoading = document.getElementById('job-feed-loading');
    const jobFeedError = document.getElementById('job-feed-error');
    const jobFeedErrorText = document.getElementById('job-feed-error-text');
    const jobFeedContainer = document.getElementById('job-feed-container');
    const jobFeedEmpty = document.getElementById('job-feed-empty');

    fetchJobsBtn.addEventListener('click', async () => {
        const jobTitle = jobTitleInput.value.trim();
        const location = locationInput.value.trim();

        if (!jobTitle || !location) {
            showJobError("Please enter both a job title and a location.");
            return;
        }
        
        if (profileResult.classList.contains('hidden')) {
            showJobError("Please upload and process your CV first on the Upload CV tab to enable AI matching.");
            return;
        }

        const formData = new FormData();
        formData.append('session_id', sessionId);
        formData.append('job_title', jobTitle);
        formData.append('location', location);

        jobFeedEmpty.classList.add('hidden');
        jobFeedContainer.innerHTML = '';
        jobFeedError.classList.add('hidden');
        jobFeedLoading.classList.remove('hidden');

        try {
            const response = await fetch('/api/fetch-jobs', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || "Failed to fetch jobs.");
            }

            if (data.jobs && data.jobs.length > 0) {
                renderJobs(data.jobs);
                fetchAndApplyScores(formData); // Score the jobs dynamically
            } else {
                showJobError("No jobs found for this search. Please try different keywords.");
            }

        } catch (error) {
            showJobError(error.message);
        } finally {
            jobFeedLoading.classList.add('hidden');
        }
    });

    async function fetchAndApplyScores(formData) {
        try {
            const response = await fetch('/api/score-jobs', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            
            if (response.ok && data.success) {
                const scores = data.scores;
                const cards = Array.from(jobFeedContainer.children);
                
                cards.forEach(card => {
                    const jobId = card.getAttribute('data-job-id');
                    const badge = card.querySelector('.score-badge');
                    if (jobId && scores[jobId] !== undefined) {
                        const score = scores[jobId];
                        card.setAttribute('data-score', score);
                        
                        // Update badge
                        badge.classList.remove('score-loading');
                        badge.innerHTML = `${score}% Match`;
                        
                        if (score > 70) badge.classList.add('badge-green');
                        else if (score >= 40) badge.classList.add('badge-amber');
                        else badge.classList.add('badge-red');
                    } else {
                        badge.classList.remove('score-loading');
                        badge.classList.add('badge-amber');
                        badge.innerHTML = 'Score unavailable';
                    }
                });

                // Sort cards descending
                cards.sort((a, b) => {
                    const scoreA = parseInt(a.getAttribute('data-score')) || 0;
                    const scoreB = parseInt(b.getAttribute('data-score')) || 0;
                    return scoreB - scoreA;
                });
                
                jobFeedContainer.innerHTML = '';
                cards.forEach(card => jobFeedContainer.appendChild(card));
            }
        } catch (e) {
            console.error("Failed to score jobs", e);
        }
    }

    function showJobError(msg) {
        jobFeedErrorText.textContent = msg;
        jobFeedError.classList.remove('hidden');
    }

    function renderJobs(jobs) {
        jobFeedContainer.innerHTML = '';
        jobs.forEach(job => {
            const card = document.createElement('div');
            card.className = 'job-card';
            card.setAttribute('data-job-id', job.id);
            card.setAttribute('data-score', '0');
            
            const descriptionSnippet = job.job_description ? job.job_description.replace(/\n/g, '<br>') : 'No description available.';

            card.innerHTML = `
                <div class="job-card-header">
                    <div>
                        <h3 class="job-title">${job.job_title || 'Unknown Title'}</h3>
                        <div class="job-company">${job.company_name || 'Unknown Company'}</div>
                    </div>
                    <div class="score-badge score-loading">
                        <div class="spinner-small"></div> Scoring...
                    </div>
                </div>
                <div class="job-location">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    ${job.location || 'Unknown Location'}
                </div>
                <div class="job-preview">
                    ${descriptionSnippet}
                </div>
                <div class="job-card-actions">
                    <button class="view-more-btn" onclick="this.parentElement.previousElementSibling.classList.toggle('expanded'); this.textContent = this.textContent === 'View Full Description' ? 'Show Less' : 'View Full Description';">View Full Description</button>
                </div>
            `;
            
            const actionsDiv = card.querySelector('.job-card-actions');
            if (job.job_url) {
                const applyBtn = document.createElement('button');
                applyBtn.className = 'apply-btn';
                applyBtn.textContent = 'Apply Now';
                applyBtn.addEventListener('click', async () => {
                    window.open(job.job_url, '_blank');
                    try {
                        const score = parseInt(card.getAttribute('data-score')) || 0;
                        await fetch('/api/track-job', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                session_id: sessionId,
                                job_title: job.job_title || 'Unknown Title',
                                company_name: job.company_name || 'Unknown Company',
                                match_score: score,
                                job_url: job.job_url,
                                status: 'Applied'
                            })
                        });
                        applyBtn.textContent = 'Applied';
                        applyBtn.disabled = true;
                    } catch (e) {
                        console.error('Failed to track job', e);
                    }
                });
                actionsDiv.appendChild(applyBtn);
            }
            
            jobFeedContainer.appendChild(card);
        });
    }

    // --- Kanban Tracker Logic ---
    async function initKanban() {
        try {
            const response = await fetch(`/api/tracker-jobs?session_id=${sessionId}`);
            const data = await response.json();
            if (response.ok && data.success) {
                window.trackedJobs = data.jobs;
                renderKanban(data.jobs);
                updateDashboardStats(data.jobs);
            }
        } catch (e) {
            console.error('Failed to fetch tracker jobs', e);
        }
    }

    function renderKanban(jobs) {
        const columns = document.querySelectorAll('.kanban-column');
        
        // Clear columns except headers
        columns.forEach(col => {
            const cardsContainer = col.querySelector('.kanban-cards');
            cardsContainer.innerHTML = '';
            col.querySelector('.kanban-count').textContent = '0';
        });

        jobs.forEach(job => {
            const col = document.querySelector(`.kanban-column[data-status="${job.status}"]`);
            if (col) {
                const cardsContainer = col.querySelector('.kanban-cards');
                const card = createKanbanCard(job);
                cardsContainer.appendChild(card);
                
                const countBadge = col.querySelector('.kanban-count');
                countBadge.textContent = parseInt(countBadge.textContent) + 1;
            }
        });
        
        setupDragAndDrop();
    }

    function createKanbanCard(job) {
        const card = document.createElement('div');
        card.className = 'kanban-card';
        card.draggable = true;
        card.dataset.jobId = job.id;
        
        let badgeClass = 'badge-amber';
        if (job.match_score > 70) badgeClass = 'badge-green';
        else if (job.match_score < 40) badgeClass = 'badge-red';
        
        const timestamp = job.last_moved ? new Date(job.last_moved).toLocaleString() : new Date().toLocaleString();

        card.innerHTML = `
            <div class="kanban-card-title">${job.job_title}</div>
            <div class="kanban-card-company">${job.company_name}</div>
            <div class="kanban-card-footer">
                <span class="score-badge ${badgeClass}">${job.match_score}% Match</span>
                <span class="kanban-timestamp">${timestamp}</span>
            </div>
        `;
        return card;
    }

    function setupDragAndDrop() {
        const cards = document.querySelectorAll('.kanban-card');
        const columns = document.querySelectorAll('.kanban-column');
        let draggedCard = null;

        cards.forEach(card => {
            card.addEventListener('dragstart', () => {
                draggedCard = card;
                setTimeout(() => card.classList.add('dragging'), 0);
            });
            card.addEventListener('dragend', () => {
                draggedCard = null;
                card.classList.remove('dragging');
            });
        });

        columns.forEach(column => {
            column.addEventListener('dragover', e => {
                e.preventDefault();
                column.classList.add('drag-over');
            });
            
            column.addEventListener('dragleave', () => {
                column.classList.remove('drag-over');
            });
            
            column.addEventListener('drop', async e => {
                e.preventDefault();
                column.classList.remove('drag-over');
                if (!draggedCard) return;
                
                const cardsContainer = column.querySelector('.kanban-cards');
                cardsContainer.appendChild(draggedCard);
                
                // Update counts
                updateKanbanCounts();
                
                // Update backend
                const newStatus = column.dataset.status;
                const jobId = draggedCard.dataset.jobId;
                
                try {
                    const response = await fetch('/api/tracker-jobs/' + jobId, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus })
                    });
                    const data = await response.json();
                    if (data.success && data.last_moved) {
                        draggedCard.querySelector('.kanban-timestamp').textContent = new Date(data.last_moved).toLocaleString();
                        
                        // Update global jobs state and dashboard
                        if (window.trackedJobs) {
                            const updatedJob = window.trackedJobs.find(j => j.id == jobId);
                            if (updatedJob) updatedJob.status = newStatus;
                            updateDashboardStats(window.trackedJobs);
                        }
                    }
                } catch (err) {
                    console.error('Failed to update job status', err);
                }
            });
        });
    }

    function updateKanbanCounts() {
        const columns = document.querySelectorAll('.kanban-column');
        columns.forEach(col => {
            const count = col.querySelectorAll('.kanban-card').length;
            col.querySelector('.kanban-count').textContent = count;
        });
    }

    // --- Dashboard Analytics Logic ---
    async function initDashboard() {
        try {
            const response = await fetch(`/api/tracker-jobs?session_id=${sessionId}`);
            const data = await response.json();
            if (response.ok && data.success) {
                window.trackedJobs = data.jobs;
                updateDashboardStats(data.jobs);
            }
        } catch (e) {
            console.error('Failed to fetch dashboard jobs', e);
        }
    }

    function updateDashboardStats(jobs) {
        if (!jobs) return;
        
        // Exclude 'Saved'
        const activeJobs = jobs.filter(j => j.status !== 'Saved');
        const totalApps = activeJobs.length;
        
        // Response rate
        const beyondApplied = activeJobs.filter(j => 
            ['Screening', 'Technical Interview', 'Offer', 'Rejected'].includes(j.status)
        ).length;
        const responseRate = totalApps > 0 ? Math.round((beyondApplied / totalApps) * 100) : 0;
        
        // Average match score
        const totalScore = activeJobs.reduce((sum, j) => sum + (j.match_score || 0), 0);
        const avgScore = totalApps > 0 ? Math.round(totalScore / totalApps) : 0;
        
        // Update Stat Cards
        document.getElementById('stat-total-apps').textContent = totalApps;
        document.getElementById('stat-response-rate').textContent = responseRate + '%';
        document.getElementById('stat-avg-score').textContent = avgScore + '%';
        
        // Update Bar Chart
        const stages = {
            'Applied': 0,
            'Screening': 0,
            'Technical Interview': 0,
            'Offer': 0
        };
        activeJobs.forEach(j => {
            if (stages[j.status] !== undefined) {
                stages[j.status]++;
            }
        });
        
        const maxCount = Math.max(...Object.values(stages), 1); // Avoid division by zero
        
        ['applied', 'screening', 'technical', 'offer'].forEach(stage => {
            let key = '';
            if (stage === 'applied') key = 'Applied';
            if (stage === 'screening') key = 'Screening';
            if (stage === 'technical') key = 'Technical Interview';
            if (stage === 'offer') key = 'Offer';
            
            const count = stages[key];
            const heightPercent = (count / maxCount) * 100;
            
            document.getElementById(`val-${stage}`).textContent = count;
            document.getElementById(`bar-${stage}`).style.height = count > 0 ? `${Math.max(heightPercent, 10)}%` : '5%';
        });
    }

    // --- Settings Modal Logic ---
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const settingsSuccess = document.getElementById('settings-success');
    const settingsError = document.getElementById('settings-error');
    const settingsErrorText = document.getElementById('settings-error-text');

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            settingsModal.classList.remove('hidden');
            settingsSuccess.classList.add('hidden');
            settingsError.classList.add('hidden');
        });

        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });

        saveSettingsBtn.addEventListener('click', async () => {
            const groqKey = document.getElementById('groq-api-key').value.trim();
            const rapidapiKey = document.getElementById('rapidapi-key').value.trim();
            
            settingsSuccess.classList.add('hidden');
            settingsError.classList.add('hidden');
            
            try {
                const response = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        groq_api_key: groqKey,
                        rapidapi_key: rapidapiKey
                    })
                });
                
                const data = await response.json();
                if (response.ok && data.success) {
                    settingsSuccess.classList.remove('hidden');
                    setTimeout(() => settingsModal.classList.add('hidden'), 1500);
                } else {
                    throw new Error(data.detail || "Failed to save settings.");
                }
            } catch (e) {
                settingsErrorText.textContent = e.message;
                settingsError.classList.remove('hidden');
            }
        });
    }
});
