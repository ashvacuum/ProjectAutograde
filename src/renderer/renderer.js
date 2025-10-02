class UnityAutoGraderApp {
    constructor() {
        this.currentPanel = 'dashboard';
        this.canvasConnected = false;
        this.claudeCodeAvailable = false;
        this.activeGradingSession = null;
        this.gradingResults = [];
        this.currentAssignment = null;
        this.currentResultsFilter = 'all';

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.checkStoredCanvasAuth();
        await this.checkLLMStatus();
        this.loadDashboardData();
        this.currentEditingProvider = null;
        this.supportedProviders = {};
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const panel = item.dataset.panel;
                this.showPanel(panel);
            });
        });

        // Canvas Authentication Form
        const canvasAuthForm = document.getElementById('canvas-auth-form');
        if (canvasAuthForm) {
            canvasAuthForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.authenticateCanvas();
            });
        }

        // API Key Form
        const apiKeyForm = document.getElementById('api-key-form-element');
        if (apiKeyForm) {
            apiKeyForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveAPIKey();
            });
        }

        // Late Penalty Settings Event Listeners
        const penaltyPerDaySelect = document.getElementById('penalty-per-day');
        const maxPenaltySelect = document.getElementById('max-penalty');
        const gracePeriodInput = document.getElementById('grace-period');

        if (penaltyPerDaySelect) {
            penaltyPerDaySelect.addEventListener('change', () => this.updateLatePenaltyExample());
        }
        if (maxPenaltySelect) {
            maxPenaltySelect.addEventListener('change', () => this.updateLatePenaltyExample());
        }
        if (gracePeriodInput) {
            gracePeriodInput.addEventListener('input', () => this.updateLatePenaltyExample());
        }

        // Course selection
        const courseSelect = document.getElementById('course-select');
        if (courseSelect) {
            courseSelect.addEventListener('change', () => {
                this.loadAssignments();
            });
        }

        // Listen for app events
        if (window.electronAPI) {
            window.electronAPI.onAppError((event, error) => {
                this.showToast(`Application Error: ${error.message}`, 'error');
            });

            window.electronAPI.onGradingProgress((event, progress) => {
                this.updateGradingProgress(progress);
            });

            window.electronAPI.onGradingComplete((event, results) => {
                this.handleGradingComplete(results);
            });
        }
    }

    showPanel(panelName) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-panel="${panelName}"]`).classList.add('active');

        // Update content panels
        document.querySelectorAll('.content-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        document.getElementById(`${panelName}-panel`).classList.add('active');

        this.currentPanel = panelName;

        // Load panel-specific data
        switch (panelName) {
            case 'canvas-setup':
                this.loadCanvasSetupData();
                break;
            case 'assignments':
                this.loadCoursesForAssignments();
                break;
            case 'criteria':
                this.loadCriteriaTemplates();
                break;
            case 'results':
                this.loadGradingResults();
                this.updateSavedResultsInfo();
                break;
            case 'grading':
                this.loadGradingPanel();
                break;
            case 'settings':
                this.loadSettingsPanel();
                break;
        }
    }

    async checkStoredCanvasAuth() {
        try {
            const storedUser = await window.electronAPI.store.get('canvas.user');
            const storedApiUrl = await window.electronAPI.store.get('canvas.apiUrl');
            const authenticatedAt = await window.electronAPI.store.get('canvas.authenticatedAt');

            if (storedUser && storedApiUrl) {
                this.canvasConnected = true;
                this.updateConnectionStatus('connected');

                // Display stored Canvas info in Canvas Setup panel if we're there
                const infoCard = document.getElementById('canvas-info');
                const userInfoDiv = document.getElementById('canvas-user-info');
                if (userInfoDiv) {
                    userInfoDiv.innerHTML = `
                        <p><strong>Name:</strong> ${storedUser.name || 'Unknown'}</p>
                        <p><strong>Email:</strong> ${storedUser.primary_email || storedUser.email || 'Not available'}</p>
                        <p><strong>ID:</strong> ${storedUser.id || 'Unknown'}</p>
                        <p><strong>API URL:</strong> ${storedApiUrl}</p>
                        <p><strong>Last Authenticated:</strong> ${authenticatedAt ? new Date(authenticatedAt).toLocaleString() : 'Unknown'}</p>
                    `;
                    if (infoCard) infoCard.style.display = 'block';
                }

                this.showToast('Canvas credentials loaded successfully', 'success');
            }
        } catch (error) {
            console.error('Error checking stored Canvas auth:', error);
        }
    }

    async checkLLMStatus() {
        try {
            const status = await window.electronAPI.llm.getAnalysisResult('status');
            this.llmAvailable = status && status.isAvailable;

            const statusElement = document.getElementById('llm-status');
            const indicatorElement = document.getElementById('llm-indicator');

            if (this.llmAvailable) {
                const providerName = status.providerName || 'LLM Provider';
                statusElement.textContent = `${providerName} is configured and ready for AI-powered grading.`;
                indicatorElement.className = 'status-indicator status-connected';
                indicatorElement.textContent = 'Available';
            } else {
                statusElement.textContent = 'No LLM provider configured. Grading will use basic code analysis only. Configure an API key in Settings for AI grading features.';
                indicatorElement.className = 'status-indicator status-disconnected';
                indicatorElement.textContent = 'Not Available';
            }
        } catch (error) {
            console.error('Error checking LLM status:', error);
            this.llmAvailable = false;

            const statusElement = document.getElementById('llm-status');
            const indicatorElement = document.getElementById('llm-indicator');

            statusElement.textContent = 'Unable to check LLM status. Grading will use basic analysis.';
            indicatorElement.className = 'status-indicator status-disconnected';
            indicatorElement.textContent = 'Unknown';
        }
    }

    async authenticateCanvas() {
        const url = document.getElementById('canvas-url').value.trim();
        const token = document.getElementById('canvas-token').value.trim();

        if (!url || !token) {
            this.showToast('Please enter both Canvas URL and API token', 'warning');
            return;
        }

        try {
            this.showToast('Connecting to Canvas...', 'info');

            const result = await window.electronAPI.canvas.authenticate(url, token);

            if (result.success) {
                this.canvasConnected = true;
                this.updateConnectionStatus('connected');
                this.showCanvasUserInfo(result.user);
                this.showToast('Successfully connected to Canvas!', 'success');
            } else {
                this.showToast(`Canvas connection failed: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error connecting to Canvas: ${error.message}`, 'error');
        }
    }

    async testCanvasConnection() {
        const url = document.getElementById('canvas-url').value.trim();
        const token = document.getElementById('canvas-token').value.trim();

        if (!url || !token) {
            this.showToast('Please enter both Canvas URL and API token', 'warning');
            return;
        }

        try {
            this.showToast('Testing Canvas connection...', 'info');
            const result = await window.electronAPI.canvas.authenticate(url, token);

            if (result.success) {
                this.showToast('Canvas connection test successful!', 'success');
            } else {
                this.showToast(`Connection test failed: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Connection test error: ${error.message}`, 'error');
        }
    }

    showCanvasUserInfo(user) {
        const infoCard = document.getElementById('canvas-info');
        const userInfoDiv = document.getElementById('canvas-user-info');

        userInfoDiv.innerHTML = `
            <p><strong>Name:</strong> ${user.name}</p>
            <p><strong>Email:</strong> ${user.primary_email || user.email || 'Not available'}</p>
            <p><strong>ID:</strong> ${user.id}</p>
            <p><strong>Connected:</strong> ${new Date().toLocaleString()}</p>
        `;

        infoCard.style.display = 'block';
    }

    async loadGradingCourses() {
        try {
            const result = await window.electronAPI.canvas.getCourses();
            if (result.success) {
                const select = document.getElementById('grading-course-select');
                select.innerHTML = '<option value="">Select Course</option>';

                result.courses.forEach(course => {
                    const option = document.createElement('option');
                    option.value = course.id;
                    option.textContent = course.name;
                    select.appendChild(option);
                });

                // Add event listener for course selection
                select.addEventListener('change', (e) => {
                    this.loadGradingAssignments(e.target.value);
                });
            } else {
                this.showToast('Failed to load courses', 'error');
            }
        } catch (error) {
            this.showToast(`Error loading courses: ${error.message}`, 'error');
        }
    }

    async loadGradingAssignments(courseId) {
        console.log(`🔄 loadGradingAssignments called with courseId: ${courseId}`);

        if (!courseId) {
            console.log('❌ No courseId provided, resetting selects');
            document.getElementById('grading-assignment-select').innerHTML = '<option value="">Select Assignment</option>';
            document.getElementById('grading-student-select').innerHTML = '<option value="">Select an assignment first</option>';
            document.getElementById('grading-student-select').disabled = true;
            return;
        }

        try {
            const result = await window.electronAPI.canvas.getAssignments(courseId);
            console.log('📦 Assignments result:', result);

            if (result.success) {
                const select = document.getElementById('grading-assignment-select');
                select.innerHTML = '<option value="">Select Assignment</option>';

                console.log(`📝 Loading ${result.assignments.length} assignments`);

                result.assignments.forEach(assignment => {
                    const option = document.createElement('option');
                    option.value = assignment.id;
                    option.textContent = assignment.name;
                    select.appendChild(option);
                });

                // Remove any existing event listeners by cloning the element
                const newSelect = select.cloneNode(true);
                select.parentNode.replaceChild(newSelect, select);

                // Add event listener for assignment selection to load submissions
                newSelect.addEventListener('change', (e) => {
                    console.log(`🎯 Assignment changed! Selected ID: ${e.target.value}`);

                    // Visual feedback
                    const debugPanel = document.getElementById('student-select-debug');
                    if (debugPanel) {
                        debugPanel.style.display = 'block';
                        debugPanel.innerHTML = 'Loading submissions...';
                    }

                    if (e.target.value) {
                        console.log(`   Calling loadGradingSubmissions(${courseId}, ${e.target.value})`);
                        this.loadGradingSubmissions(courseId, e.target.value);
                    } else {
                        console.log('⚠️ No assignment selected (empty value)');
                        if (debugPanel) debugPanel.style.display = 'none';
                    }
                });

                console.log('✅ Assignment dropdown populated and event listener attached');
                console.log(`   Total options: ${newSelect.options.length}`);
            } else {
                console.log('❌ Failed to load assignments:', result.error);
                this.showToast('Failed to load assignments', 'error');
            }
        } catch (error) {
            console.error('❌ Error loading assignments:', error);
            this.showToast(`Error loading assignments: ${error.message}`, 'error');
        }
    }

    async loadGradingSubmissions(courseId, assignmentId) {
        console.log(`🔄 loadGradingSubmissions called with courseId: ${courseId}, assignmentId: ${assignmentId}`);

        const studentSelect = document.getElementById('grading-student-select');
        console.log('📋 Student select element:', studentSelect);

        if (!courseId || !assignmentId) {
            console.log('❌ Missing courseId or assignmentId');
            studentSelect.innerHTML = '<option value="">Select an assignment first</option>';
            studentSelect.disabled = true;
            return;
        }

        try {
            studentSelect.innerHTML = '<option value="">Loading submissions...</option>';
            studentSelect.disabled = true;
            console.log('⏳ Loading submissions from Canvas...');

            const result = await window.electronAPI.canvas.getSubmissions(courseId, assignmentId);
            console.log('📦 Submissions result:', result);

            if (result.success) {
                const submissions = result.submissions;
                console.log(`📝 Total submissions received: ${submissions.length}`);

                // Log first submission for debugging
                if (submissions.length > 0) {
                    console.log('🔍 Sample submission structure:', {
                        user_id: submissions[0].user_id,
                        id: submissions[0].id,
                        body: submissions[0].body?.substring(0, 100),
                        url: submissions[0].url,
                        attachments: submissions[0].attachments,
                        user: submissions[0].user,
                        submitted_at: submissions[0].submitted_at,
                        allKeys: Object.keys(submissions[0])
                    });
                }

                // Filter for submissions with GitHub URLs
                const githubSubmissions = submissions.filter((sub, index) => {
                    console.log(`🔍 Checking submission ${index + 1}/${submissions.length} for user ${sub.user_id}:`);
                    console.log(`   - github_url: ${sub.github_url ? (sub.github_url.includes('github.com') ? 'HAS GITHUB' : sub.github_url) : 'null'}`);
                    console.log(`   - githubUrl: ${sub.githubUrl ? (sub.githubUrl.includes('github.com') ? 'HAS GITHUB' : sub.githubUrl) : 'null'}`);
                    console.log(`   - body: ${sub.body ? (sub.body.includes('github.com') ? 'HAS GITHUB' : 'no github') : 'null'}`);
                    console.log(`   - url: ${sub.url ? (sub.url.includes('github.com') ? 'HAS GITHUB' : sub.url) : 'null'}`);
                    console.log(`   - attachments: ${sub.attachments ? sub.attachments.length + ' items' : 'null'}`);

                    // Check github_url field (snake_case) - THIS IS THE MAIN FIELD!
                    if (sub.github_url && sub.github_url.includes('github.com')) {
                        console.log(`✅ Found GitHub URL in github_url for user ${sub.user_id}: ${sub.github_url}`);
                        return true;
                    }

                    // Check githubUrl field (camelCase)
                    if (sub.githubUrl && sub.githubUrl.includes('github.com')) {
                        console.log(`✅ Found GitHub URL in githubUrl for user ${sub.user_id}: ${sub.githubUrl}`);
                        return true;
                    }

                    // Check submission text for GitHub URL
                    if (sub.body && sub.body.includes('github.com')) {
                        console.log(`✅ Found GitHub URL in body for user ${sub.user_id}`);
                        return true;
                    }

                    // Check URL submission
                    if (sub.url && sub.url.includes('github.com')) {
                        console.log(`✅ Found GitHub URL in url field for user ${sub.user_id}: ${sub.url}`);
                        return true;
                    }

                    // Check attachments for GitHub URLs
                    if (sub.attachments && sub.attachments.some(att =>
                        att.url && att.url.includes('github.com')
                    )) {
                        console.log(`✅ Found GitHub URL in attachments for user ${sub.user_id}`);
                        return true;
                    }

                    // Check submission comments
                    if (sub.submission_comments && sub.submission_comments.length > 0) {
                        const hasGithubComment = sub.submission_comments.some(comment =>
                            comment.comment && comment.comment.includes('github.com')
                        );
                        if (hasGithubComment) {
                            console.log(`✅ Found GitHub URL in submission_comments for user ${sub.user_id}`);
                            return true;
                        }
                    }

                    console.log(`❌ No GitHub URL found for user ${sub.user_id}`);
                    return false;
                });

                console.log(`🎯 Filtered GitHub submissions: ${githubSubmissions.length}`);

                studentSelect.innerHTML = '<option value="">Select a student</option>';

                if (githubSubmissions.length === 0) {
                    console.log('⚠️ No GitHub submissions found');
                    console.log('📋 Showing ALL submissions for debugging...');

                    // Show all submissions for debugging (even without GitHub URLs)
                    if (submissions.length > 0) {
                        submissions.forEach((submission, index) => {
                            const option = document.createElement('option');
                            option.value = submission.user_id || index;
                            const studentName = submission.user?.name || submission.user?.sortable_name || `User ${submission.user_id}`;
                            const submittedAt = submission.submitted_at ? new Date(submission.submitted_at).toLocaleDateString() : 'No date';
                            option.textContent = `⚠️ ${studentName} - ${submittedAt} (NO GITHUB URL)`;
                            option.dataset.submission = JSON.stringify(submission);
                            option.dataset.githubUrl = ''; // Empty
                            studentSelect.appendChild(option);
                        });
                        studentSelect.disabled = false;

                        const debugPanel = document.getElementById('student-select-debug');
                        if (debugPanel) {
                            debugPanel.style.display = 'block';
                            debugPanel.innerHTML = `
                                ⚠️ No GitHub URLs found in ${submissions.length} submissions<br>
                                Showing all submissions for debugging<br>
                                Check console for submission structure
                            `;
                        }
                    } else {
                        const option = document.createElement('option');
                        option.value = '';
                        option.textContent = 'No submissions found';
                        studentSelect.appendChild(option);
                        studentSelect.disabled = true;
                    }
                } else {
                    console.log(`📝 Building dropdown with ${githubSubmissions.length} submissions`);

                    githubSubmissions.forEach((submission, index) => {
                        const option = document.createElement('option');
                        option.value = submission.user_id;
                        option.dataset.submissionId = submission.id;

                        // Extract GitHub URL for display - check all possible fields
                        let githubUrl = '';

                        // Priority 1: github_url field (snake_case) - Canvas API standard
                        if (submission.github_url && submission.github_url.includes('github.com')) {
                            githubUrl = submission.github_url;
                        }
                        // Priority 2: githubUrl field (camelCase)
                        else if (submission.githubUrl && submission.githubUrl.includes('github.com')) {
                            githubUrl = submission.githubUrl;
                        }
                        // Priority 3: url field
                        else if (submission.url && submission.url.includes('github.com')) {
                            githubUrl = submission.url;
                        }
                        // Priority 4: Parse from body text
                        else if (submission.body && submission.body.includes('github.com')) {
                            const match = submission.body.match(/https?:\/\/github\.com\/[^\s<>'"]+/);
                            githubUrl = match ? match[0] : '';
                        }
                        // Priority 5: attachments
                        else if (submission.attachments && submission.attachments.length > 0) {
                            const githubAtt = submission.attachments.find(att => att.url && att.url.includes('github.com'));
                            if (githubAtt) {
                                githubUrl = githubAtt.url;
                            }
                        }
                        // Priority 6: submission comments
                        else if (submission.submission_comments && submission.submission_comments.length > 0) {
                            const githubComment = submission.submission_comments.find(comment =>
                                comment.comment && comment.comment.includes('github.com')
                            );
                            if (githubComment) {
                                const match = githubComment.comment.match(/https?:\/\/github\.com\/[^\s<>'"]+/);
                                githubUrl = match ? match[0] : '';
                            }
                        }

                        const studentName = submission.user?.name || submission.user?.sortable_name || `User ${submission.user_id}`;
                        const submittedAt = submission.submitted_at ? new Date(submission.submitted_at).toLocaleDateString() : 'No date';

                        option.textContent = `${studentName} - ${submittedAt}`;
                        option.dataset.githubUrl = githubUrl;
                        option.dataset.submission = JSON.stringify(submission);

                        console.log(`  ${index + 1}. ${studentName} - GitHub: ${githubUrl}`);
                        studentSelect.appendChild(option);
                    });

                    studentSelect.disabled = false;
                    studentSelect.style.pointerEvents = 'auto'; // Force enable pointer events
                    studentSelect.style.opacity = '1'; // Make sure it's visible

                    console.log(`✅ Student select enabled with ${studentSelect.options.length} options`);
                    console.log(`   Disabled state: ${studentSelect.disabled}`);
                    console.log(`   Display style: ${studentSelect.style.display}`);
                    console.log(`   Visibility: ${studentSelect.style.visibility}`);
                    console.log(`   Pointer events: ${studentSelect.style.pointerEvents}`);
                    console.log(`   Opacity: ${studentSelect.style.opacity}`);
                    console.log(`   Z-index: ${window.getComputedStyle(studentSelect).zIndex}`);
                    console.log(`   Position: ${window.getComputedStyle(studentSelect).position}`);

                    // Update debug panel
                    const debugPanel = document.getElementById('student-select-debug');
                    if (debugPanel) {
                        debugPanel.style.display = 'block';
                        debugPanel.innerHTML = `
                            ✅ Loaded ${githubSubmissions.length} submissions<br>
                            Disabled: ${studentSelect.disabled}<br>
                            Options: ${studentSelect.options.length}<br>
                            Pointer Events: ${studentSelect.style.pointerEvents}<br>
                            <button onclick="console.log('Test button clicked'); document.getElementById('grading-student-select').focus();" style="margin-top: 4px; padding: 4px 8px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; border-radius: 4px; cursor: pointer;">Test Click</button>
                        `;
                    }

                    // Add a test click listener to verify it's clickable
                    studentSelect.addEventListener('click', () => {
                        console.log('🖱️ Student select was clicked!');
                    }, { once: true });

                    // Add change listener
                    studentSelect.addEventListener('change', (e) => {
                        console.log(`🎯 Student selection changed! Selected user ID: ${e.target.value}`);
                        const selectedOption = e.target.options[e.target.selectedIndex];
                        console.log(`   Student name: ${selectedOption.textContent}`);
                        console.log(`   GitHub URL: ${selectedOption.dataset.githubUrl}`);
                    });
                }
            } else {
                console.log('❌ Failed to load submissions:', result.error);
                studentSelect.innerHTML = '<option value="">Error loading submissions</option>';
                studentSelect.disabled = true;
                this.showToast(`Failed to load submissions: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('❌ Error loading submissions:', error);
            studentSelect.innerHTML = '<option value="">Error loading submissions</option>';
            studentSelect.disabled = true;
            this.showToast(`Error loading submissions: ${error.message}`, 'error');
        }
    }

    async loadGradingCriteria() {
        try {
            const select = document.getElementById('grading-criteria-select');
            const savedCriteriaId = select?.value || '';

            console.log('💾 Saving criteria selection:', savedCriteriaId);

            const templates = await window.electronAPI.store.get('criteria.templates') || [];
            select.innerHTML = '<option value="">Select Criteria Template</option>';

            templates.forEach(template => {
                const option = document.createElement('option');
                option.value = template.id;
                option.textContent = template.name;
                select.appendChild(option);
            });

            if (templates.length === 0) {
                const option = document.createElement('option');
                option.value = 'default';
                option.textContent = 'Default Unity Game Programming Rubric';
                select.appendChild(option);
            }

            // Restore selection
            if (savedCriteriaId) {
                console.log('♻️ Restoring criteria selection:', savedCriteriaId);
                select.value = savedCriteriaId;
            }
        } catch (error) {
            this.showToast(`Error loading criteria: ${error.message}`, 'error');
        }
    }

    async loadCoursesForAssignments() {
        if (!this.canvasConnected) {
            document.getElementById('assignments-list').innerHTML =
                '<p>Please connect to Canvas first in the Canvas Setup section.</p>';
            return;
        }

        try {
            const result = await window.electronAPI.canvas.getCourses();
            const courseSelect = document.getElementById('course-select');

            if (result.success && result.courses.length > 0) {
                courseSelect.innerHTML = '<option value="">Select a course...</option>';
                result.courses.forEach(course => {
                    const option = document.createElement('option');
                    option.value = course.id;
                    option.textContent = course.name;
                    courseSelect.appendChild(option);
                });
            } else {
                courseSelect.innerHTML = '<option value="">No courses found</option>';
            }
        } catch (error) {
            this.showToast(`Error loading courses: ${error.message}`, 'error');
        }
    }

    async loadAssignments() {
        const courseId = document.getElementById('course-select').value;
        const assignmentsList = document.getElementById('assignments-list');

        if (!courseId) {
            assignmentsList.innerHTML = '<p>Select a course to view assignments.</p>';
            return;
        }

        try {
            this.showToast('Loading assignments...', 'info');
            const result = await window.electronAPI.canvas.getAssignments(courseId);

            if (result.success && result.assignments.length > 0) {
                let html = '<table class="table"><thead><tr><th>Assignment</th><th>Due Date</th><th>Submissions</th><th>Actions</th></tr></thead><tbody>';

                for (const assignment of result.assignments) {
                    const dueDate = assignment.due_at ? new Date(assignment.due_at).toLocaleDateString() : 'No due date';
                    html += `
                        <tr>
                            <td>${assignment.name}</td>
                            <td>${dueDate}</td>
                            <td><button class="btn btn-secondary" onclick="app.viewSubmissions(${courseId}, ${assignment.id})">View</button></td>
                            <td><button class="btn" onclick="app.gradeAssignment(${courseId}, ${assignment.id})">Grade</button></td>
                        </tr>
                    `;
                }

                html += '</tbody></table>';
                assignmentsList.innerHTML = html;
            } else {
                assignmentsList.innerHTML = '<p>No assignments found for this course.</p>';
            }

            this.showToast('Assignments loaded successfully', 'success');
        } catch (error) {
            assignmentsList.innerHTML = '<p>Error loading assignments.</p>';
            this.showToast(`Error loading assignments: ${error.message}`, 'error');
        }
    }

    async viewSubmissions(courseId, assignmentId) {
        try {
            this.showToast('Loading submissions...', 'info');
            const result = await window.electronAPI.canvas.getSubmissions(courseId, assignmentId);

            if (result.success) {
                console.log('Submissions:', result.submissions);
                this.showToast(`Found ${result.submissions.length} submissions`, 'success');

                // Display submissions in the assignments list area
                const assignmentsList = document.getElementById('assignments-list');

                if (result.submissions.length === 0) {
                    assignmentsList.innerHTML = '<p>No submissions found for this assignment.</p>';
                    return;
                }

                // Create submissions table
                let html = '<div style="margin-bottom: 20px;"><button class="btn btn-secondary" onclick="app.loadAssignments()">← Back to Assignments</button></div>';
                html += '<h3>Assignment Submissions</h3>';
                html += '<table class="table"><thead><tr><th>Student</th><th>Submission Date</th><th>GitHub Repository</th><th>Actions</th></tr></thead><tbody>';

                result.submissions.forEach((submission, index) => {
                    const studentName = submission.user ? submission.user.name : 'Unknown Student';
                    const submittedAt = submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : 'Not submitted';

                    // Extract GitHub URL
                    let githubUrl = '';
                    if (submission.github_url && submission.github_url.includes('github.com')) {
                        githubUrl = submission.github_url;
                    } else if (submission.attachments) {
                        const githubAttachment = submission.attachments.find(att =>
                            att.url && att.url.includes('github.com')
                        );
                        if (githubAttachment) {
                            githubUrl = githubAttachment.url;
                        }
                    }

                    const githubDisplay = githubUrl
                        ? `<a href="#" onclick="window.electronAPI.app.openExternal('${githubUrl}')" style="color: #4CAF50;">${githubUrl}</a>`
                        : '<span style="color: #f44336;">No GitHub URL found</span>';

                    html += `
                        <tr>
                            <td>${studentName}</td>
                            <td>${submittedAt}</td>
                            <td>${githubDisplay}</td>
                            <td>
                                ${githubUrl ? `<button class="btn" onclick="app.gradeIndividualSubmission('${courseId}', '${assignmentId}', '${submission.user_id}', '${githubUrl}')">Grade This</button>` : '<span style="color: #999;">Cannot grade</span>'}
                            </td>
                        </tr>
                    `;
                });

                html += '</tbody></table>';

                // Count submissions with GitHub URLs
                const githubSubmissions = result.submissions.filter(sub => {
                    return (sub.github_url && sub.github_url.includes('github.com')) ||
                           (sub.attachments && sub.attachments.some(att =>
                               att.url && att.url.includes('github.com')
                           ));
                });

                html += `<p style="margin-top: 20px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 5px;">
                    <strong>Summary:</strong> ${result.submissions.length} total submissions, ${githubSubmissions.length} with GitHub repositories
                </p>`;

                assignmentsList.innerHTML = html;
                this.showToast(`${githubSubmissions.length} submissions have GitHub URLs`, 'info');
            }
        } catch (error) {
            this.showToast(`Error loading submissions: ${error.message}`, 'error');
        }
    }

    async gradeIndividualSubmission(courseId, assignmentId, userId, githubUrl) {
        try {
            this.showToast('Starting individual submission grading...', 'info');

            // Navigate to grading panel and populate with this specific submission
            this.showPanel('grading');

            // Load the dropdowns first
            await this.loadGradingCourses();
            await this.loadGradingCriteria();

            // Wait a bit for dropdowns to populate
            setTimeout(() => {
                // Set the course and assignment
                const courseSelect = document.getElementById('grading-course-select');
                const assignmentSelect = document.getElementById('grading-assignment-select');

                if (courseSelect) {
                    courseSelect.value = courseId;
                    // Trigger assignment loading
                    this.loadGradingAssignments(courseId);

                    setTimeout(() => {
                        if (assignmentSelect) {
                            assignmentSelect.value = assignmentId;
                        }
                    }, 500);
                }

                // Set instructions with the GitHub URL
                const instructionsField = document.getElementById('grading-instructions');
                if (instructionsField) {
                    instructionsField.value = `Grade this specific submission from GitHub: ${githubUrl}`;
                }

                this.showToast('Grading panel prepared for individual submission', 'success');
            }, 1000);

        } catch (error) {
            this.showToast(`Error preparing individual grading: ${error.message}`, 'error');
        }
    }

    async gradeAssignment(courseId, assignmentId) {
        try {
            if (!this.canvasConnected) {
                this.showToast('Please connect to Canvas first', 'warning');
                this.showPanel('canvas-setup');
                return;
            }

            this.showToast('Loading assignment for grading...', 'info');

            // Get assignment details first
            const assignmentsResult = await window.electronAPI.canvas.getAssignments(courseId);
            if (!assignmentsResult.success) {
                this.showToast(`Failed to load assignment details: ${assignmentsResult.error}`, 'error');
                return;
            }

            const assignment = assignmentsResult.assignments.find(a => a.id === assignmentId);
            if (!assignment) {
                this.showToast('Assignment not found', 'error');
                return;
            }

            // Get assignment submissions
            const submissionsResult = await window.electronAPI.canvas.getSubmissions(courseId, assignmentId);

            if (!submissionsResult.success) {
                this.showToast(`Failed to load submissions: ${submissionsResult.error}`, 'error');
                return;
            }

            const submissions = submissionsResult.submissions;
            const githubSubmissions = submissions.filter(sub => {
                // Check if there's a direct github_url field
                if (sub.github_url && sub.github_url.includes('github.com')) {
                    return true;
                }

                // Fallback: check attachments for GitHub URLs
                if (sub.attachments && sub.attachments.some(att =>
                    att.url && (att.url.includes('github.com') || att.display_name.includes('github'))
                )) {
                    return true;
                }

                return false;
            });

            if (githubSubmissions.length === 0) {
                this.showToast('No GitHub submissions found for this assignment', 'warning');
                return;
            }

            // Store assignment data for batch grading
            this.currentAssignment = {
                courseId: courseId,
                assignmentId: assignmentId,
                assignmentDetails: assignment,
                submissions: githubSubmissions
            };

            this.showToast(`Found ${githubSubmissions.length} GitHub submissions ready for grading`, 'success');

            // Show batch grading interface on assignments page
            this.showBatchGradingInterface(assignment, githubSubmissions);

        } catch (error) {
            this.showToast(`Error preparing assignment for grading: ${error.message}`, 'error');
        }
    }

    showBatchGradingInterface(assignment, submissions) {
        const assignmentsList = document.getElementById('assignments-list');

        let html = '<div style="margin-bottom: 20px;"><button class="btn btn-secondary" onclick="app.loadAssignments()">← Back to Assignments</button></div>';

        html += `
            <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h3>Assignment: ${assignment.name}</h3>
                <p><strong>Due Date:</strong> ${assignment.due_at ? new Date(assignment.due_at).toLocaleDateString() : 'No due date'}</p>
                <p><strong>Description:</strong> ${assignment.description || 'No description available'}</p>
                <p><strong>GitHub Submissions Found:</strong> ${submissions.length}</p>
            </div>

            <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h3>Batch Grading Configuration</h3>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500;">Grading Criteria</label>
                    <select id="batch-criteria-select" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: white;">
                        <option value="">Select Criteria Template</option>
                    </select>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500;">Additional Instructions</label>
                    <textarea id="batch-instructions" placeholder="Additional grading instructions for this assignment..." style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: white; resize: vertical; min-height: 60px;"></textarea>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                        <input type="checkbox" id="batch-use-claude-code" style="margin: 0;">
                        Use Claude Code integration for enhanced analysis
                    </label>
                </div>

                <div style="display: flex; gap: 12px; align-items: center;">
                    <button class="btn" onclick="app.startBatchGradingFromAssignments()" id="start-batch-grading-from-assignments-btn" disabled>
                        Start Batch Grading (${submissions.length} submissions)
                    </button>
                    <button class="btn btn-secondary" onclick="app.cancelBatchGrading()" id="cancel-batch-grading-btn" style="display: none;">
                        Cancel
                    </button>
                </div>

                <div class="progress-container" id="batch-progress-container" style="margin-top: 20px; display: none;">
                    <div class="progress-bar" id="batch-progress-bar">
                        <div class="progress-fill" id="batch-progress-fill" style="width: 0%;"></div>
                    </div>
                    <div class="progress-text" id="batch-progress-text">Preparing...</div>
                </div>
            </div>
        `;

        assignmentsList.innerHTML = html;

        // Load criteria options
        this.loadBatchCriteriaOptions();
    }

    async loadBatchCriteriaOptions() {
        try {
            const templates = await window.electronAPI.store.get('criteria.templates') || [];
            const select = document.getElementById('batch-criteria-select');

            if (!select) return;

            select.innerHTML = '<option value="">Select Criteria Template</option>';

            templates.forEach(template => {
                const option = document.createElement('option');
                option.value = template.id;
                option.textContent = template.name;
                select.appendChild(option);
            });

            if (templates.length === 0) {
                const option = document.createElement('option');
                option.value = 'default';
                option.textContent = 'Default Unity Game Programming Rubric';
                select.appendChild(option);
            }

            // Enable the start button when criteria is selected
            select.addEventListener('change', () => {
                const startBtn = document.getElementById('start-batch-grading-from-assignments-btn');
                if (startBtn) {
                    startBtn.disabled = !select.value;
                }
            });

        } catch (error) {
            this.showToast(`Error loading criteria: ${error.message}`, 'error');
        }
    }

    async startBatchGradingFromAssignments() {
        const criteriaId = document.getElementById('batch-criteria-select').value;
        const instructions = document.getElementById('batch-instructions').value;
        const useClaudeCode = document.getElementById('batch-use-claude-code').checked;

        console.log('=== BATCH GRADING START ===');
        console.log('Criteria ID:', criteriaId);
        console.log('Instructions:', instructions);
        console.log('Use Claude Code:', useClaudeCode);
        console.log('Current Assignment:', this.currentAssignment);

        if (!criteriaId) {
            this.showToast('Please select grading criteria', 'warning');
            return;
        }

        if (!this.currentAssignment) {
            this.showToast('No assignment selected for grading', 'error');
            return;
        }

        try {
            console.log(`📊 Starting batch grading for ${this.currentAssignment.submissions.length} submissions`);
            this.showToast('Starting batch grading...', 'info');

            // Show progress UI
            const progressContainer = document.getElementById('batch-progress-container');
            const startBtn = document.getElementById('start-batch-grading-from-assignments-btn');
            const cancelBtn = document.getElementById('cancel-batch-grading-btn');

            if (progressContainer) progressContainer.style.display = 'block';
            if (startBtn) startBtn.disabled = true;
            if (cancelBtn) cancelBtn.style.display = 'inline-block';

            // Get selected criteria
            const criteriaTemplates = await window.electronAPI.store.get('criteria.templates') || [];
            let selectedCriteria = criteriaTemplates.find(t => t.id === criteriaId) || this.getDefaultCriteria();

            // Clean criteria for IPC serialization (remove functions, circular refs, RegExp, etc.)
            try {
                selectedCriteria = JSON.parse(JSON.stringify(selectedCriteria));
                console.log('✅ Criteria serialized successfully');
            } catch (error) {
                console.error('❌ Error serializing criteria:', error);
                this.showToast('Error preparing grading criteria', 'error');
                return;
            }

            // Process all submissions
            this.gradingResults = [];
            const submissions = this.currentAssignment.submissions;

            for (let i = 0; i < submissions.length; i++) {
                const submission = submissions[i];
                const progress = ((i + 1) / submissions.length) * 100;

                console.log(`\n--- Processing Submission ${i + 1}/${submissions.length} ---`);
                console.log('Student:', submission.user?.name || 'Unknown');
                console.log('User ID:', submission.user_id);

                // Update progress
                const progressFill = document.getElementById('batch-progress-fill');
                const progressText = document.getElementById('batch-progress-text');

                if (progressFill) progressFill.style.width = `${progress}%`;
                if (progressText) progressText.textContent = `Grading ${submission.user?.name || 'Unknown'} (${i + 1}/${submissions.length})`;

                // Extract GitHub URL
                let githubUrl = '';
                if (submission.github_url && submission.github_url.includes('github.com')) {
                    githubUrl = submission.github_url;
                    console.log('✅ Found GitHub URL (github_url):', githubUrl);
                } else if (submission.githubUrl && submission.githubUrl.includes('github.com')) {
                    githubUrl = submission.githubUrl;
                    console.log('✅ Found GitHub URL (githubUrl):', githubUrl);
                } else if (submission.attachments) {
                    console.log('Checking attachments for GitHub URL...');
                    const githubAttachment = submission.attachments.find(att =>
                        att.url && att.url.includes('github.com')
                    );
                    if (githubAttachment) {
                        githubUrl = githubAttachment.url;
                        console.log('✅ Found GitHub URL in attachments:', githubUrl);
                    } else {
                        console.log('⚠️  No GitHub URL found in attachments');
                    }
                } else {
                    console.log('❌ No GitHub URL found for this submission');
                }

                if (githubUrl) {
                    console.log('📥 Starting analysis for:', githubUrl);

                    // Pass assignment details for context (ensure serializable)
                    let assignmentContext = null;
                    if (this.currentAssignment) {
                        assignmentContext = {
                            name: this.currentAssignment.assignmentDetails?.name || '',
                            description: this.currentAssignment.assignmentDetails?.description || '',
                            due_at: this.currentAssignment.assignmentDetails?.due_at || null,
                            points_possible: this.currentAssignment.assignmentDetails?.points_possible || 0
                        };

                        // Ensure it's serializable
                        try {
                            assignmentContext = JSON.parse(JSON.stringify(assignmentContext));
                        } catch (error) {
                            console.warn('⚠️  Assignment context not serializable, using null');
                            assignmentContext = null;
                        }
                    }

                    console.log('Assignment Context:', assignmentContext);
                    console.log('Criteria:', selectedCriteria.name || 'Default');

                    try {
                        const startTime = Date.now();

                        const result = await window.electronAPI.grader.analyzeProject(
                            githubUrl,
                            selectedCriteria,
                            assignmentContext
                        );

                        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                        console.log(`✅ Analysis completed in ${duration}s`);
                        console.log('Result:', result);

                        if (result.success) {
                            console.log('Grade extracted:', result.grade);
                            this.gradingResults.push({
                                studentName: submission.user?.name || 'Unknown Student',
                                userId: submission.user_id,
                                githubUrl,
                                grade: result.grade,
                                result: result.analysis
                            });
                        } else {
                            console.error('❌ Analysis failed:', result.error);
                            this.gradingResults.push({
                                studentName: submission.user?.name || 'Unknown Student',
                                userId: submission.user_id,
                                githubUrl,
                                error: result.error || 'Analysis failed',
                                needsInstructorIntervention: true,
                                interventionReason: 'Analysis returned failure'
                            });
                        }
                    } catch (error) {
                        console.error(`❌ Error grading ${githubUrl}:`, error);
                        console.error('Error stack:', error.stack);
                        this.gradingResults.push({
                            studentName: submission.user?.name || 'Unknown Student',
                            userId: submission.user_id,
                            githubUrl,
                            error: error.message,
                            needsInstructorIntervention: true,
                            interventionReason: 'Grading error occurred'
                        });
                    }
                } else {
                    console.log(`⏭️  Skipping submission ${i + 1} - no GitHub URL`);
                }
            }

            this.showToast(`Batch grading completed! Processed ${this.gradingResults.length} submissions`, 'success');

            // Navigate to results
            this.showPanel('results');
            this.loadGradingResults();

        } catch (error) {
            this.showToast(`Error during batch grading: ${error.message}`, 'error');
        }
    }

    cancelBatchGrading() {
        // Hide progress and reset UI
        const progressContainer = document.getElementById('batch-progress-container');
        const startBtn = document.getElementById('start-batch-grading-from-assignments-btn');
        const cancelBtn = document.getElementById('cancel-batch-grading-btn');

        if (progressContainer) progressContainer.style.display = 'none';
        if (startBtn) startBtn.disabled = false;
        if (cancelBtn) cancelBtn.style.display = 'none';

        this.showToast('Batch grading cancelled', 'info');
    }

    updateGradingPanelForAssignment() {
        if (!this.currentAssignment) return;

        const progressDiv = document.getElementById('grading-progress');
        const startBtn = document.getElementById('start-grading-btn');
        const assignment = this.currentAssignment.assignmentDetails;

        if (progressDiv) {
            const dueDate = assignment?.due_at ? new Date(assignment.due_at).toLocaleDateString() : 'Not specified';
            const points = assignment?.points_possible || 'Not specified';

            progressDiv.innerHTML = `
                <div style="background: rgba(255,255,255,0.1); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                    <h4 style="margin: 0 0 8px 0;">${assignment?.name || 'Assignment'}</h4>
                    <p style="margin: 4px 0;"><strong>Due Date:</strong> ${dueDate}</p>
                    <p style="margin: 4px 0;"><strong>Points Possible:</strong> ${points}</p>
                    <p style="margin: 4px 0;"><strong>GitHub Submissions:</strong> ${this.currentAssignment.submissions.length}</p>
                    ${assignment?.description ? `<p style="margin: 8px 0 0 0; font-size: 0.9em; opacity: 0.8;">${assignment.description.substring(0, 200)}${assignment.description.length > 200 ? '...' : ''}</p>` : ''}
                </div>
                <p><strong>Ready for AI-powered grading with Claude Code.</strong></p>
                <p>Click "Start Batch Grading" to begin comprehensive analysis of all GitHub submissions.</p>
            `;
        }

        if (startBtn) {
            startBtn.disabled = false;
            startBtn.textContent = `Grade ${this.currentAssignment.submissions.length} Submissions`;
        }
    }

    async startBatchGrading() {
        if (!this.canvasConnected) {
            this.showToast('Please connect to Canvas first', 'warning');
            return;
        }

        if (!this.currentAssignment) {
            this.showToast('Please select an assignment to grade first', 'warning');
            this.showPanel('assignments');
            return;
        }

        try {
            this.showToast('Starting batch grading...', 'info');

            // Show progress UI
            document.getElementById('progress-bar').style.display = 'block';
            document.getElementById('start-grading-btn').disabled = true;
            document.getElementById('cancel-grading-btn').style.display = 'inline-block';

            // Get criteria for grading and ensure it's serializable
            const criteriaTemplates = await window.electronAPI.store.get('criteria.templates') || [];
            const rawCriteria = criteriaTemplates.length > 0 ? criteriaTemplates[0] : this.getDefaultCriteria();

            // Create a clean, serializable criteria object
            const criteria = JSON.parse(JSON.stringify(rawCriteria));

            // Start grading process
            this.activeGradingSession = {
                courseId: this.currentAssignment.courseId,
                assignmentId: this.currentAssignment.assignmentId,
                startTime: Date.now(),
                totalSubmissions: this.currentAssignment.submissions.length,
                completedSubmissions: 0,
                submissions: this.currentAssignment.submissions,
                criteria: criteria
            };

            this.showToast(`Starting to grade ${this.activeGradingSession.totalSubmissions} submissions`, 'info');

            // Start processing submissions
            await this.processSubmissionsForGrading();

        } catch (error) {
            this.showToast(`Error starting batch grading: ${error.message}`, 'error');
            this.resetGradingUI();
        }
    }

    async startIndividualGrading() {
        if (!this.canvasConnected) {
            this.showToast('Please connect to Canvas first', 'warning');
            return;
        }

        const courseId = document.getElementById('grading-course-select').value;
        const assignmentId = document.getElementById('grading-assignment-select').value;
        const studentId = document.getElementById('grading-student-select').value;
        const criteriaId = document.getElementById('grading-criteria-select').value;
        const instructions = document.getElementById('grading-instructions').value;
        const useClaudeCode = document.getElementById('use-claude-code').checked;

        if (!courseId || !assignmentId || !criteriaId) {
            this.showToast('Please select course, assignment, and criteria', 'warning');
            return;
        }

        if (!studentId) {
            this.showToast('Please select a student submission', 'warning');
            return;
        }

        try {
            this.showToast('Starting individual assignment grading...', 'info');

            // Show progress UI
            const progressBar = document.getElementById('progress-bar');
            const startIndividualBtn = document.getElementById('start-individual-grading-btn');
            const startBatchBtn = document.getElementById('start-batch-grading-btn');
            const cancelBtn = document.getElementById('cancel-grading-btn');

            if (progressBar) progressBar.style.display = 'block';
            if (startIndividualBtn) startIndividualBtn.disabled = true;
            if (startBatchBtn) startBatchBtn.disabled = true;
            if (cancelBtn) cancelBtn.style.display = 'inline-block';

            // Get selected criteria
            const criteriaTemplates = await window.electronAPI.store.get('criteria.templates') || [];
            const selectedCriteria = criteriaTemplates.find(t => t.id === criteriaId) || this.getDefaultCriteria();

            console.log('\n========================================');
            console.log('📋 INDIVIDUAL GRADING CRITERIA DEBUG');
            console.log('========================================');
            console.log('Criteria ID selected:', criteriaId);
            console.log('All templates available:', criteriaTemplates.map(t => ({ id: t.id, name: t.name })));
            console.log('Selected criteria:', {
                id: selectedCriteria.id,
                name: selectedCriteria.name,
                totalPoints: selectedCriteria.totalPoints,
                itemCount: selectedCriteria.items?.length
            });

            if (selectedCriteria.items) {
                console.log('Criteria items:');
                selectedCriteria.items.forEach((item, idx) => {
                    console.log(`  ${idx + 1}. ${item.name} (${item.id}) - ${item.points} points`);
                });

                const calcTotal = selectedCriteria.items.reduce((sum, item) => sum + (item.points || 0), 0);
                console.log(`Calculated total from items: ${calcTotal}`);

                if (selectedCriteria.totalPoints !== calcTotal) {
                    console.warn(`⚠️ Mismatch! totalPoints=${selectedCriteria.totalPoints}, sum of items=${calcTotal}`);
                }
            }
            console.log('========================================\n');

            // Start individual grading process
            const gradingData = {
                courseId,
                assignmentId,
                criteria: JSON.parse(JSON.stringify(selectedCriteria)),
                instructions,
                useClaudeCode
            };

            this.activeGradingSession = {
                courseId,
                assignmentId,
                type: 'individual',
                startTime: Date.now()
            };

            // Get the selected submission data from the dropdown
            const studentSelect = document.getElementById('grading-student-select');
            const selectedOption = studentSelect.options[studentSelect.selectedIndex];
            const githubUrl = selectedOption.dataset.githubUrl;
            const submissionData = JSON.parse(selectedOption.dataset.submission);

            if (!githubUrl) {
                this.showToast('Selected submission does not have a GitHub URL', 'error');
                this.resetGradingUI();
                return;
            }

            this.gradingResults = [];

            this.showToast(`Grading submission from ${submissionData.user?.name || 'student'}: ${githubUrl}`, 'info');

            // Get assignment details for late penalty calculation
            const assignmentsResult = await window.electronAPI.canvas.getAssignments(courseId);
            let assignmentDetails = null;

            if (assignmentsResult.success) {
                const assignment = assignmentsResult.assignments.find(a => a.id == assignmentId);
                if (assignment) {
                    assignmentDetails = {
                        ...assignment,
                        submitted_at: submissionData.submitted_at
                    };
                }
            }

            console.log('📡 Calling grader.analyzeProject...');
            console.log('   GitHub URL:', githubUrl);
            console.log('   Criteria:', selectedCriteria.name);
            console.log('   Assignment:', assignmentDetails?.name);

            const result = await window.electronAPI.grader.analyzeProject(githubUrl, selectedCriteria, assignmentDetails);

            console.log('\n========================================');
            console.log('📥 GRADING RESULT RECEIVED');
            console.log('========================================');
            console.log('Success:', result.success);

            if (result.success) {
                console.log('Grade object:', result.grade);
                console.log('   Overall Grade:', result.grade?.overallGrade);
                console.log('   Max Points:', result.grade?.maxPoints);
                console.log('   Original Grade (before penalty):', result.grade?.originalGradeBeforePenalty);

                if (result.grade?.criteriaScores) {
                    console.log('   Criteria Scores:');
                    Object.entries(result.grade.criteriaScores).forEach(([id, data]) => {
                        console.log(`     ${id}: ${data.score}/${data.maxScore}`);
                    });
                }

                if (result.latePenalty) {
                    console.log('Late Penalty:', result.latePenalty);
                    console.log('   Days Late:', result.latePenalty.daysLate);
                    console.log('   Penalty %:', result.latePenalty.penaltyPercentage);
                    console.log('   Penalty Points:', result.latePenalty.penaltyPoints);
                }

                console.log('========================================\n');

                this.gradingResults.push({
                    studentName: submissionData.user?.name || submissionData.user?.sortable_name || `User ${studentId}`,
                    studentId: studentId,
                    submissionId: submissionData.id,
                    githubUrl: githubUrl,
                    grade: result.grade,
                    analysis: result.analysis,
                    latePenalty: result.latePenalty,
                    submittedAt: submissionData.submitted_at,
                    courseId: courseId,
                    assignmentId: assignmentId
                });

                this.showToast('Individual grading completed successfully!', 'success');

                // Auto-save results
                console.log('💾 Auto-saving grading results...');
                await this.saveGradingResults();

                // Navigate to results panel
                this.showPanel('results');
                this.loadGradingResults();
            } else {
                console.error('❌ Grading failed!');
                console.error('   Error:', result.error);
                console.log('========================================\n');
                this.showToast(`Grading failed: ${result.error}`, 'error');
            }

        } catch (error) {
            this.showToast(`Error starting individual grading: ${error.message}`, 'error');
        } finally {
            this.resetGradingUI();
        }
    }

    getDefaultCriteria() {
        return {
            id: 'default-unity-rubric',
            name: 'Unity Game Programming Rubric',
            description: 'Standard rubric for Unity game programming assignments',
            totalPoints: 50,
            items: [
                {
                    id: 'requirement-completion',
                    name: 'Requirement Completion',
                    description: 'Assessment of how well the student completed all assignment requirements',
                    points: 12,
                    weight: 'high',
                    ratings: [
                        {
                            name: 'Completed Requirements',
                            points: 12,
                            description: 'The student completed all the requirements given to the assignment.'
                        },
                        {
                            name: '25% Requirement Missing',
                            points: 9.6,
                            description: 'The student has 25% of the requirements missing.'
                        },
                        {
                            name: 'Half of the requirement missing',
                            points: 4.8,
                            description: 'The student has only half of the requirements given to the assignment.'
                        },
                        {
                            name: '75% or more of the requirements missing',
                            points: 0,
                            description: 'The student missed 75% or more of the requirements given to the assignment.'
                        }
                    ]
                },
                {
                    id: 'game-execution',
                    name: 'Game Execution',
                    description: 'Assessment of how well the game runs without errors or bugs',
                    points: 13,
                    weight: 'high',
                    ratings: [
                        {
                            name: 'Smooth Execution',
                            points: 13,
                            description: 'The game program executes without errors/bugs.'
                        },
                        {
                            name: 'Some non-game breaking bugs/errors',
                            points: 10.4,
                            description: 'The game program executes with errors/bugs, but are not game-breaking.'
                        },
                        {
                            name: 'Some game-breaking bugs/errors',
                            points: 5.2,
                            description: 'The game program executes with some game-breaking errors/bugs.'
                        },
                        {
                            name: 'Didn\'t Run/Lots of Bugs/Errors',
                            points: 0,
                            description: 'The game program didn\'t even run/has a lot of game-breaking bugs-errors that render it unplayable.'
                        }
                    ]
                },
                {
                    id: 'code-readability',
                    name: 'Code Readability',
                    description: 'Assessment of code organization, comments, naming conventions, and formatting',
                    points: 12,
                    weight: 'medium',
                    ratings: [
                        {
                            name: 'Masterful',
                            points: 12,
                            description: 'The student uses proper comments, indention, variable and method names throughout the project.'
                        },
                        {
                            name: 'Satisfactory',
                            points: 9.6,
                            description: 'The student uses proper comments, indention, variable and method names on some of his/her classes.'
                        },
                        {
                            name: 'Fair',
                            points: 4.8,
                            description: 'The student attempted to use proper comments, indention, variable and method names.'
                        },
                        {
                            name: 'No Attempt',
                            points: 0,
                            description: 'The student didn\'t use proper comments, indention, variable and method names.'
                        }
                    ]
                },
                {
                    id: 'solution-delivery',
                    name: 'Solution Delivery',
                    description: 'Assessment of solution quality, optimization, and creativity',
                    points: 13,
                    weight: 'high',
                    ratings: [
                        {
                            name: 'Optimal Solution',
                            points: 13,
                            description: 'The student\'s solution uses optimal solution towards the problem. Optimal solution includes shorter solution, better calculations, creative solutions.'
                        },
                        {
                            name: 'Satisfactory Solution',
                            points: 10.4,
                            description: 'The student\'s solution uses satisfactory solution towards the problem.'
                        },
                        {
                            name: 'Fair Solution',
                            points: 5.2,
                            description: 'The student\'s solution uses fair solution towards the problem.'
                        },
                        {
                            name: 'Poor Solution',
                            points: 0,
                            description: 'The student didn\'t attempt to create an optimal solution/the solution creates more problems and issues to the game program.'
                        }
                    ]
                }
            ]
        };
    }

    async processSubmissionsForGrading() {
        if (!this.activeGradingSession) return;

        const results = [];

        for (let i = 0; i < this.activeGradingSession.submissions.length; i++) {
            const submission = this.activeGradingSession.submissions[i];

            try {
                // Update progress
                const progress = {
                    current: i + 1,
                    total: this.activeGradingSession.totalSubmissions,
                    percentage: Math.round(((i + 1) / this.activeGradingSession.totalSubmissions) * 100),
                    currentStudent: submission.user?.name || `Submission ${i + 1}`
                };

                this.updateGradingProgress(progress);

                // Extract GitHub URL
                const githubUrl = this.extractGithubUrl(submission);

                if (githubUrl) {
                    // Validate GitHub URL before attempting to grade
                    const validation = this.validateGithubUrl(githubUrl);

                    if (validation.valid) {
                        this.showToast(`Grading: ${progress.currentStudent}`, 'info');

                        // Use the clean URL for grading
                        const gradingResult = await this.gradeUnityProject(validation.cleanUrl, this.activeGradingSession.criteria);

                        // Create serializable result object
                        results.push({
                            submission: {
                                id: submission.id,
                                user_id: submission.user_id,
                                assignment_id: submission.assignment_id,
                                submitted_at: submission.submitted_at
                            },
                            githubUrl: validation.cleanUrl,
                            originalUrl: githubUrl,
                            grade: gradingResult,
                            studentName: submission.user?.name || 'Unknown',
                            userId: submission.user_id
                        });
                    } else {
                        // Flag for instructor intervention
                        results.push({
                            submission: {
                                id: submission.id,
                                user_id: submission.user_id,
                                assignment_id: submission.assignment_id,
                                submitted_at: submission.submitted_at
                            },
                            githubUrl: githubUrl,
                            error: `Invalid GitHub URL: ${validation.reason}`,
                            needsInstructorIntervention: true,
                            studentName: submission.user?.name || 'Unknown',
                            userId: submission.user_id,
                            interventionReason: 'GitHub URL validation failed'
                        });
                    }
                } else {
                    results.push({
                        submission: {
                            id: submission.id,
                            user_id: submission.user_id,
                            assignment_id: submission.assignment_id,
                            submitted_at: submission.submitted_at
                        },
                        error: 'No GitHub URL found in submission attachments',
                        needsInstructorIntervention: true,
                        studentName: submission.user?.name || 'Unknown',
                        userId: submission.user_id,
                        interventionReason: 'Missing GitHub URL'
                    });
                }

                this.activeGradingSession.completedSubmissions = i + 1;

            } catch (error) {
                console.error(`Error grading submission ${i + 1}:`, error);
                results.push({
                    submission: {
                        id: submission.id,
                        user_id: submission.user_id,
                        assignment_id: submission.assignment_id,
                        submitted_at: submission.submitted_at
                    },
                    error: error.message,
                    studentName: submission.user?.name || 'Unknown',
                    userId: submission.user_id
                });
            }
        }

        // Complete grading
        this.handleGradingComplete(results);
    }

    extractGithubUrl(submission) {
        // First check if there's a direct github_url field
        if (submission.github_url && submission.github_url.includes('github.com')) {
            return submission.github_url;
        }

        // Fallback: check attachments for GitHub URLs
        if (submission.attachments) {
            for (const attachment of submission.attachments) {
                if (attachment.url && attachment.url.includes('github.com')) {
                    return attachment.url;
                }
                if (attachment.display_name && attachment.display_name.includes('github')) {
                    return attachment.url;
                }
            }
        }

        return null;
    }

    validateGithubUrl(url) {
        if (!url) return { valid: false, reason: 'No URL provided' };

        try {
            const urlObj = new URL(url);

            // Check if it's a GitHub URL
            if (!urlObj.hostname.includes('github.com')) {
                return { valid: false, reason: 'URL is not from github.com' };
            }

            // Check for basic GitHub repository URL pattern
            const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);

            if (pathParts.length < 2) {
                return { valid: false, reason: 'URL does not appear to be a valid GitHub repository (missing owner/repo)' };
            }

            // Check for common invalid patterns
            if (pathParts.includes('gist')) {
                return { valid: false, reason: 'GitHub Gist URLs are not supported, repository URL required' };
            }

            if (pathParts.includes('releases') || pathParts.includes('issues') || pathParts.includes('wiki')) {
                return { valid: false, reason: 'URL points to a specific GitHub page, repository root URL required' };
            }

            // Handle URLs that include tree/branch references or subdirectories
            if (pathParts.includes('tree') || pathParts.includes('blob')) {
                // These are valid but we want to clean them to the root repository URL
                // URL format: github.com/owner/repo/tree/branch/path or github.com/owner/repo/blob/branch/file
            }

            // Check for private repository indicators (this is basic and may not catch all cases)
            if (url.includes('/private/') || url.includes('?private=')) {
                return { valid: false, reason: 'Repository appears to be private and may not be accessible for grading' };
            }

            // Clean the repository name (remove .git suffix)
            let repoName = pathParts[1];
            if (repoName.endsWith('.git')) {
                repoName = repoName.slice(0, -4);
            }

            return {
                valid: true,
                owner: pathParts[0],
                repo: repoName,
                cleanUrl: `https://github.com/${pathParts[0]}/${repoName}`
            };

        } catch (error) {
            return { valid: false, reason: `Invalid URL format: ${error.message}` };
        }
    }

    async gradeUnityProject(githubUrl, criteria) {
        try {
            // Get assignment details if available and serialize only needed fields
            let assignmentDetails = null;
            if (this.currentAssignment?.assignmentDetails) {
                const assignment = this.currentAssignment.assignmentDetails;
                assignmentDetails = {
                    name: assignment.name || '',
                    description: assignment.description || '',
                    due_at: assignment.due_at || null,
                    points_possible: assignment.points_possible || null,
                    id: assignment.id || null
                };
            }

            // Call the grader to analyze the project with assignment context
            const result = await window.electronAPI.grader.analyzeProject(githubUrl, criteria, assignmentDetails);

            if (result.success) {
                return result.grade || {
                    overallGrade: 75,
                    maxPoints: 100,
                    feedback: 'Basic analysis completed'
                };
            } else {
                throw new Error(result.error || 'Grading failed');
            }
        } catch (error) {
            console.error('Grading error:', error);
            return {
                overallGrade: 0,
                maxPoints: 100,
                feedback: `Grading failed: ${error.message}`,
                error: true
            };
        }
    }

    updateGradingProgress(progress) {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('grading-progress');

        if (progressFill) {
            progressFill.style.width = `${progress.percentage}%`;
        }

        if (progressText) {
            progressText.innerHTML = `
                <p>Grading in progress: ${progress.current}/${progress.total} submissions</p>
                <p>Current: ${progress.currentStudent || 'Processing...'}</p>
            `;
        }
    }

    handleGradingComplete(results) {
        this.gradingResults = results;
        this.activeGradingSession = null;

        this.resetGradingUI();
        this.showToast(`Grading complete! Processed ${results.length} submissions`, 'success');

        // Navigate to results panel
        this.showPanel('results');
    }

    resetGradingUI() {
        document.getElementById('progress-bar').style.display = 'none';

        // Re-enable both grading buttons
        const startIndividualBtn = document.getElementById('start-individual-grading-btn');
        const startBatchBtn = document.getElementById('start-batch-grading-btn');
        const startGradingBtn = document.getElementById('start-grading-btn');

        if (startIndividualBtn) startIndividualBtn.disabled = false;
        if (startBatchBtn) startBatchBtn.disabled = false;
        if (startGradingBtn) startGradingBtn.disabled = false;

        document.getElementById('cancel-grading-btn').style.display = 'none';
        document.getElementById('grading-progress').innerHTML = '<p>No active grading session.</p>';
    }

    async loadCriteriaTemplates() {
        try {
            const templates = await window.electronAPI.store.get('criteria.templates') || [];
            const templatesDiv = document.getElementById('criteria-templates');

            if (templates.length === 0) {
                templatesDiv.innerHTML = '<p>No criteria templates found. Create your first template above.</p>';
            } else {
                let html = '';
                templates.forEach((template, index) => {
                    const totalPoints = template.totalPoints || template.items.reduce((sum, item) => sum + (item.points || 0), 0);
                    html += `
                        <div class="card">
                            <h4>${template.name}</h4>
                            <p>${template.description || 'No description provided'}</p>
                            <p><strong>Total Points:</strong> ${totalPoints} | <strong>Criteria:</strong> ${template.items.length}</p>
                            <div style="margin-top: 12px; font-size: 12px; opacity: 0.8;">
                                ${template.items.map(item => `${item.name} (${item.points}pts)`).join(' • ')}
                            </div>
                            <div style="margin-top: 16px;">
                                <button class="btn btn-secondary" onclick="app.editCriteria(${index})">Edit</button>
                                <button class="btn btn-secondary" onclick="app.deleteCriteria(${index})" style="margin-left: 8px;">Delete</button>
                                <button class="btn" onclick="app.previewCriteria(${index})" style="margin-left: 8px;">Preview</button>
                            </div>
                        </div>
                    `;
                });
                templatesDiv.innerHTML = html;
            }
        } catch (error) {
            console.error('Error loading criteria templates:', error);
        }
    }

    async loadDefaultCriteria() {
        const defaultCriteria = this.getDefaultCriteria();

        try {
            let templates = await window.electronAPI.store.get('criteria.templates') || [];

            // Check if the new rubric already exists
            const existingIndex = templates.findIndex(t => t.name === defaultCriteria.name);

            if (existingIndex >= 0) {
                // Replace existing template
                templates[existingIndex] = defaultCriteria;
                this.showToast('Default rubric updated!', 'success');
            } else {
                // Add new template
                templates.push(defaultCriteria);
                this.showToast('Default Unity Game Programming Rubric added!', 'success');
            }

            await window.electronAPI.store.set('criteria.templates', templates);
            this.loadCriteriaTemplates();

        } catch (error) {
            this.showToast(`Error adding default criteria: ${error.message}`, 'error');
        }
    }

    async editCriteria(index) {
        try {
            const templates = await window.electronAPI.store.get('criteria.templates') || [];
            if (index >= 0 && index < templates.length) {
                const template = templates[index];
                this.showToast(`Edit functionality for "${template.name}" coming soon!`, 'info');
                // TODO: Implement criteria editing modal/form
            }
        } catch (error) {
            this.showToast(`Error editing criteria: ${error.message}`, 'error');
        }
    }

    async deleteCriteria(index) {
        try {
            const templates = await window.electronAPI.store.get('criteria.templates') || [];
            if (index >= 0 && index < templates.length) {
                const template = templates[index];

                // Confirm deletion
                const confirmed = confirm(`Are you sure you want to delete the criteria template "${template.name}"?`);
                if (confirmed) {
                    templates.splice(index, 1);
                    await window.electronAPI.store.set('criteria.templates', templates);

                    this.loadCriteriaTemplates();
                    this.showToast(`Criteria template "${template.name}" deleted successfully!`, 'success');
                }
            }
        } catch (error) {
            this.showToast(`Error deleting criteria: ${error.message}`, 'error');
        }
    }

    async saveGradingResults() {
        try {
            if (!this.gradingResults || this.gradingResults.length === 0) {
                console.log('⚠️ No results to save');
                return;
            }

            const result = await window.electronAPI.results.save(this.gradingResults);

            if (result.success) {
                console.log(`✅ Saved ${this.gradingResults.length} results (total: ${result.count})`);
                // Update the saved results info display
                await this.updateSavedResultsInfo();
            } else {
                console.error('❌ Failed to save results:', result.error);
            }
        } catch (error) {
            console.error('❌ Error saving results:', error);
        }
    }

    async loadGradingResults() {
        const resultsTable = document.getElementById('results-table');
        const summaryDiv = document.getElementById('results-summary');

        // Load saved results if current results are empty
        if (!this.gradingResults || this.gradingResults.length === 0) {
            console.log('📥 Loading saved grading results...');
            try {
                const result = await window.electronAPI.results.load();

                if (result.success && result.results.length > 0) {
                    this.gradingResults = result.results;
                    console.log(`✅ Loaded ${result.results.length} saved results`);
                } else {
                    resultsTable.innerHTML = '<p>No grading results available.</p>';
                    summaryDiv.innerHTML = '';
                    return;
                }
            } catch (error) {
                console.error('❌ Error loading saved results:', error);
                resultsTable.innerHTML = '<p>No grading results available.</p>';
                summaryDiv.innerHTML = '';
                return;
            }
        }

        if (this.gradingResults.length === 0) {
            resultsTable.innerHTML = '<p>No grading results available.</p>';
            summaryDiv.innerHTML = '';
            return;
        }

        // Filter results based on current filter
        let filteredResults = this.gradingResults;
        switch (this.currentResultsFilter) {
            case 'graded':
                filteredResults = this.gradingResults.filter(r => !r.needsInstructorIntervention);
                break;
            case 'review':
                filteredResults = this.gradingResults.filter(r => r.needsInstructorIntervention);
                break;
            default:
                filteredResults = this.gradingResults;
        }

        // Update summary
        const totalCount = this.gradingResults.length;
        const gradedCount = this.gradingResults.filter(r => !r.needsInstructorIntervention).length;
        const reviewCount = this.gradingResults.filter(r => r.needsInstructorIntervention).length;

        summaryDiv.innerHTML = `
            Total: ${totalCount} | Graded: ${gradedCount} | Needs Review: ${reviewCount} |
            Showing: ${filteredResults.length} result(s)
        `;

        // Show review panel if there are items needing review
        const reviewPanel = document.getElementById('instructor-review-panel');
        if (reviewCount > 0 && this.currentResultsFilter === 'review') {
            reviewPanel.style.display = 'block';
            this.loadReviewQueue();
        } else {
            reviewPanel.style.display = 'none';
        }

        let html = '';

        if (reviewCount > 0 && this.currentResultsFilter === 'all') {
            html += `
                <div style="background: rgba(241, 196, 15, 0.2); border: 1px solid #f1c40f; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                    <h4 style="margin: 0 0 8px 0; color: #f1c40f;">⚠️ Instructor Intervention Required</h4>
                    <p style="margin: 0;">${reviewCount} submission(s) require manual review.
                    <button class="btn btn-secondary" onclick="filterResults('review')" style="margin-left: 8px;">View Review Queue</button></p>
                </div>
            `;
        }

        if (filteredResults.length === 0) {
            html += '<p>No results match the current filter.</p>';
            resultsTable.innerHTML = html;
            return;
        }

        html += '<table class="table"><thead><tr><th>Student</th><th>Status</th><th>Grade</th><th>GitHub URL</th><th>Actions</th></tr></thead><tbody>';

        filteredResults.forEach((result, index) => {
            const originalIndex = this.gradingResults.indexOf(result);
            const statusBadge = result.needsInstructorIntervention
                ? '<span style="background: #e74c3c; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Needs Review</span>'
                : '<span style="background: #2ecc71; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Graded</span>';

            let gradeValue = 'N/A';
            if (result.grade) {
                if (result.grade.overallGrade !== undefined) {
                    gradeValue = result.grade.overallGrade;
                } else if (result.grade.result?.overallGrade !== undefined) {
                    gradeValue = result.grade.result.overallGrade;
                }
            }
            const grade = gradeValue !== 'N/A' ? `${gradeValue}/50` : 'N/A';

            const githubUrl = result.githubUrl
                ? `<a href="${result.githubUrl}" target="_blank" style="color: #3498db; text-decoration: none;">${result.githubUrl.substring(0, 30)}...</a>`
                : 'Not provided';

            html += `
                <tr style="${result.needsInstructorIntervention ? 'background: rgba(231, 76, 60, 0.1);' : ''}">
                    <td>${result.studentName || 'Unknown'}</td>
                    <td>${statusBadge}</td>
                    <td>${grade}</td>
                    <td>${githubUrl}</td>
                    <td>
                        <button class="btn btn-secondary" onclick="app.viewDetailedResult(${originalIndex})">View Details</button>
                        ${result.needsInstructorIntervention ?
                            `<button class="btn" onclick="app.openCanvasSubmission(${originalIndex})" style="margin-left: 8px;">Review in Canvas</button>` :
                            `<button class="btn" onclick="app.postGradeToCanvas(${originalIndex})" style="margin-left: 8px;">Post to Canvas</button>`
                        }
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        resultsTable.innerHTML = html;
    }

    async exportResults(format) {
        if (this.gradingResults.length === 0) {
            this.showToast('No results to export', 'warning');
            return;
        }

        try {
            const filename = `grading_results_${new Date().toISOString().slice(0, 10)}`;

            switch (format) {
                case 'csv':
                    await window.electronAPI.export.toCsv(this.gradingResults, filename);
                    break;
                case 'json':
                    await window.electronAPI.export.toJson(this.gradingResults, filename);
                    break;
                case 'pdf':
                    await window.electronAPI.export.toPdf(this.gradingResults, filename);
                    break;
            }

            this.showToast(`Results exported to ${format.toUpperCase()} successfully!`, 'success');
        } catch (error) {
            this.showToast(`Export failed: ${error.message}`, 'error');
        }
    }

    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connection-status');

        switch (status) {
            case 'connected':
                statusElement.className = 'status-indicator status-connected';
                statusElement.textContent = 'Connected';
                break;
            case 'disconnected':
                statusElement.className = 'status-indicator status-disconnected';
                statusElement.textContent = 'Disconnected';
                break;
            case 'loading':
                statusElement.className = 'status-indicator status-loading';
                statusElement.textContent = 'Connecting...';
                break;
        }
    }

    loadDashboardData() {
        // Update recent activity
        const recentActivity = document.getElementById('recent-activity');

        // This would typically load from stored data
        const activities = [
            'Application started',
            'Checking system status...'
        ];

        if (activities.length > 0) {
            let html = '<ul>';
            activities.forEach(activity => {
                html += `<li>${activity}</li>`;
            });
            html += '</ul>';
            recentActivity.innerHTML = html;
        }
    }

    async loadCanvasSetupData() {
        try {
            // Load stored Canvas URL if available
            const url = await window.electronAPI.store.get('canvas.apiUrl');
            const user = await window.electronAPI.store.get('canvas.user');
            const authenticatedAt = await window.electronAPI.store.get('canvas.authenticatedAt');

            if (url) {
                const urlInput = document.getElementById('canvas-url');
                if (urlInput) urlInput.value = url;
            }

            // If already authenticated, show the user info
            if (user && url) {
                this.canvasConnected = true;
                this.updateConnectionStatus('connected');

                const infoCard = document.getElementById('canvas-info');
                const userInfoDiv = document.getElementById('canvas-user-info');
                if (userInfoDiv) {
                    userInfoDiv.innerHTML = `
                        <p><strong>Name:</strong> ${user.name || 'Unknown'}</p>
                        <p><strong>Email:</strong> ${user.primary_email || user.email || 'Not available'}</p>
                        <p><strong>ID:</strong> ${user.id || 'Unknown'}</p>
                        <p><strong>API URL:</strong> ${url}</p>
                        <p><strong>Last Authenticated:</strong> ${authenticatedAt ? new Date(authenticatedAt).toLocaleString() : 'Unknown'}</p>
                        <p style="margin-top: 12px;"><em>Note: API token is stored securely. Re-enter only if you want to update it.</em></p>
                    `;
                    if (infoCard) infoCard.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Error loading Canvas setup data:', error);
        }
    }

    loadGradingPanel() {
        // Update button states
        const startBtn = document.getElementById('start-grading-btn');
        const startIndividualBtn = document.getElementById('start-individual-grading-btn');
        const startBatchBtn = document.getElementById('start-batch-grading-btn');

        const canGrade = this.canvasConnected && this.llmAvailable;

        if (startBtn) startBtn.disabled = !canGrade;
        if (startIndividualBtn) startIndividualBtn.disabled = !canGrade;
        if (startBatchBtn) startBatchBtn.disabled = !canGrade;

        if (!this.canvasConnected) {
            document.getElementById('grading-progress').innerHTML =
                '<p>Canvas connection required for grading. Please connect in the Canvas Setup section.</p>';
        } else if (!this.llmAvailable) {
            document.getElementById('grading-progress').innerHTML =
                '<p>LLM integration is not available. Please configure an API key in Settings for AI-powered grading.</p>';
        } else {
            // Save current selections
            const courseSelect = document.getElementById('grading-course-select');
            const assignmentSelect = document.getElementById('grading-assignment-select');
            const studentSelect = document.getElementById('grading-student-select');
            const savedCourseId = courseSelect?.value || '';
            const savedAssignmentId = assignmentSelect?.value || '';
            const savedStudentId = studentSelect?.value || '';

            console.log('💾 Preserving selections:', {
                courseId: savedCourseId,
                assignmentId: savedAssignmentId,
                studentId: savedStudentId
            });

            // Only reload if dropdowns are empty
            const needsReload = !courseSelect || courseSelect.options.length <= 1;

            if (needsReload) {
                console.log('🔄 Reloading grading dropdowns (first time or empty)');
                this.loadGradingCourses().then(() => {
                    // After loading, restore selections if they exist
                    if (savedCourseId) {
                        console.log('♻️ Restoring courseId:', savedCourseId);
                        courseSelect.value = savedCourseId;
                        // Trigger change to reload assignments
                        this.loadGradingAssignments(savedCourseId).then(() => {
                            if (savedAssignmentId) {
                                console.log('♻️ Restoring assignmentId:', savedAssignmentId);
                                const newAssignmentSelect = document.getElementById('grading-assignment-select');
                                newAssignmentSelect.value = savedAssignmentId;
                                // Trigger change to reload students
                                this.loadGradingSubmissions(savedCourseId, savedAssignmentId).then(() => {
                                    if (savedStudentId) {
                                        console.log('♻️ Restoring studentId:', savedStudentId);
                                        const newStudentSelect = document.getElementById('grading-student-select');
                                        if (newStudentSelect) {
                                            newStudentSelect.value = savedStudentId;
                                        }
                                    }
                                });
                            }
                        });
                    }
                });
            } else {
                console.log('✅ Keeping existing grading dropdown selections');
            }

            this.loadGradingCriteria();
        }
    }

    viewDetailedResult(index) {
        const result = this.gradingResults[index];
        if (!result) return;

        let detailsHtml = `
            <h3>Detailed Results: ${result.studentName}</h3>
            <div style="background: rgba(255,255,255,0.1); padding: 16px; border-radius: 8px; margin: 16px 0;">
        `;

        if (result.needsInstructorIntervention) {
            detailsHtml += `
                <div style="background: rgba(231, 76, 60, 0.2); padding: 12px; border-radius: 4px; margin-bottom: 16px;">
                    <strong>⚠️ Requires Instructor Review</strong><br>
                    Reason: ${result.interventionReason}<br>
                    ${result.error ? `Error: ${result.error}` : ''}
                </div>
            `;
        }

        if (result.grade && result.grade.result) {
            const grade = result.grade.result;
            detailsHtml += `
                <h4>Overall Grade: ${grade.overallGrade}/50</h4>
                <h5>Criteria Breakdown:</h5>
            `;

            if (grade.criteriaScores) {
                Object.entries(grade.criteriaScores).forEach(([key, criteria]) => {
                    detailsHtml += `
                        <div style="margin: 12px 0; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                            <strong>${criteria.rating || key}:</strong> ${criteria.score}/${criteria.maxScore}<br>
                            <em>${criteria.feedback}</em>
                        </div>
                    `;
                });
            }

            if (grade.overallFeedback) {
                detailsHtml += `
                    <h5>Overall Feedback:</h5>
                    <p>${grade.overallFeedback.detailedFeedback}</p>
                `;
            }
        }

        detailsHtml += `</div>`;

        // For now, show in a toast - in a real app, this would be a modal
        this.showToast('Detailed view would open in a modal window', 'info');
    }

    filterResults(filter) {
        this.currentResultsFilter = filter;

        // Update button states
        document.querySelectorAll('[id^="filter-"]').forEach(btn => {
            btn.className = 'btn btn-secondary';
        });
        document.getElementById(`filter-${filter}`).className = 'btn';

        // Reload results with new filter
        this.loadGradingResults();
    }

    loadReviewQueue() {
        const reviewQueueDiv = document.getElementById('review-queue');
        const reviewItems = this.gradingResults.filter(r => r.needsInstructorIntervention);

        if (reviewItems.length === 0) {
            reviewQueueDiv.innerHTML = '<p>No submissions currently in review queue.</p>';
            return;
        }

        let html = '<div style="display: grid; gap: 16px;">';

        reviewItems.forEach((result, index) => {
            const originalIndex = this.gradingResults.indexOf(result);
            html += `
                <div style="background: rgba(231, 76, 60, 0.1); border: 1px solid #e74c3c; border-radius: 8px; padding: 16px;">
                    <h4 style="margin: 0 0 8px 0; color: #e74c3c;">${result.studentName}</h4>
                    <p style="margin: 4px 0;"><strong>Issue:</strong> ${result.interventionReason}</p>
                    <p style="margin: 4px 0;"><strong>Error:</strong> ${result.error || 'No specific error'}</p>
                    <p style="margin: 4px 0;"><strong>GitHub URL:</strong> ${result.githubUrl || 'Not provided'}</p>
                    <div style="margin-top: 12px;">
                        <button class="btn btn-secondary" onclick="app.openCanvasSubmission(${originalIndex})">Review in Canvas</button>
                        <button class="btn btn-secondary" onclick="app.markAsResolved(${originalIndex})" style="margin-left: 8px;">Mark as Resolved</button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        reviewQueueDiv.innerHTML = html;
    }

    async openCanvasSubmission(index) {
        const result = this.gradingResults[index];
        if (!result || !this.currentAssignment) {
            this.showToast('Cannot open Canvas submission - missing data', 'error');
            return;
        }

        try {
            // Construct Canvas submission URL
            const canvasBaseUrl = await window.electronAPI.store.get('canvas.apiUrl');
            if (!canvasBaseUrl) {
                this.showToast('Canvas URL not configured', 'error');
                return;
            }

            // Extract base URL (remove /api/v1 if present)
            const baseUrl = canvasBaseUrl.replace('/api/v1', '');
            const submissionUrl = `${baseUrl}/courses/${this.currentAssignment.courseId}/assignments/${this.currentAssignment.assignmentId}/submissions/${result.userId}`;

            // Open in external browser
            await window.electronAPI.openExternal(submissionUrl);

            this.showToast(`Opening Canvas submission for ${result.studentName}`, 'info');

        } catch (error) {
            this.showToast(`Error opening Canvas submission: ${error.message}`, 'error');
        }
    }

    async openCanvasGradebook() {
        if (!this.currentAssignment) {
            this.showToast('No assignment selected', 'warning');
            return;
        }

        try {
            const canvasBaseUrl = await window.electronAPI.store.get('canvas.apiUrl');
            if (!canvasBaseUrl) {
                this.showToast('Canvas URL not configured', 'error');
                return;
            }

            const baseUrl = canvasBaseUrl.replace('/api/v1', '');
            const gradebookUrl = `${baseUrl}/courses/${this.currentAssignment.courseId}/gradebook`;

            await window.electronAPI.openExternal(gradebookUrl);
            this.showToast('Opening Canvas gradebook in browser', 'info');

        } catch (error) {
            this.showToast(`Error opening Canvas gradebook: ${error.message}`, 'error');
        }
    }

    async postGradeToCanvas(index) {
        const result = this.gradingResults[index];

        console.log('\n========================================');
        console.log('📤 POSTING GRADE TO CANVAS');
        console.log('========================================');
        console.log('Index:', index);
        console.log('Result object:', result);
        console.log('Has result:', !!result);
        console.log('Has result.grade:', !!result?.grade);
        console.log('Has result.courseId:', !!result?.courseId);
        console.log('Has result.assignmentId:', !!result?.assignmentId);
        console.log('Has result.studentId:', !!result?.studentId);
        console.log('Has this.currentAssignment:', !!this.currentAssignment);

        if (!result) {
            console.error('❌ No result found at index', index);
            this.showToast('Cannot post grade - no result found', 'error');
            return;
        }

        if (!result.grade) {
            console.error('❌ Result has no grade data');
            this.showToast('Cannot post grade - no grade data', 'error');
            return;
        }

        // Try to get course/assignment info from result first, then fall back to currentAssignment
        let courseId, assignmentId;

        if (result.courseId && result.assignmentId) {
            console.log('✅ Using courseId and assignmentId from result');
            courseId = result.courseId;
            assignmentId = result.assignmentId;
        } else if (this.currentAssignment) {
            console.log('✅ Using courseId and assignmentId from currentAssignment');
            courseId = this.currentAssignment.courseId;
            assignmentId = this.currentAssignment.assignmentId;
        } else {
            console.error('❌ No course/assignment information available');
            this.showToast('Cannot post grade - missing course/assignment info', 'error');
            return;
        }

        console.log('Course ID:', courseId);
        console.log('Assignment ID:', assignmentId);
        console.log('Student ID:', result.studentId);

        try {
            let grade = 0;
            if (result.grade.overallGrade !== undefined) {
                grade = result.grade.overallGrade;
                console.log('✅ Found grade in result.grade.overallGrade:', grade);
            } else if (result.grade.result?.overallGrade !== undefined) {
                grade = result.grade.result.overallGrade;
                console.log('✅ Found grade in result.grade.result.overallGrade:', grade);
            } else {
                console.error('❌ Cannot find overallGrade in result structure');
                console.log('result.grade structure:', result.grade);
                this.showToast('Cannot extract grade from result', 'error');
                return;
            }

            console.log('Final grade to post:', grade);

            const feedback = this.buildCanvasFeedback(result.grade);
            console.log('Feedback length:', feedback.length, 'characters');

            console.log('📡 Calling Canvas API...');
            const postResult = await window.electronAPI.canvas.postGrade(
                courseId,
                assignmentId,
                result.studentId,
                grade,
                feedback
            );

            console.log('📥 Canvas API Response:', postResult);

            if (postResult.success) {
                console.log('✅ Grade posted successfully');
                this.showToast(`Grade posted to Canvas for ${result.studentName}`, 'success');
                result.postedToCanvas = true;
                this.loadGradingResults(); // Refresh display
            } else {
                console.error('❌ Failed to post grade:', postResult.error);
                this.showToast(`Failed to post grade: ${postResult.error}`, 'error');
            }

            console.log('========================================\n');

        } catch (error) {
            console.error('❌ Exception posting grade:', error);
            console.log('========================================\n');
            this.showToast(`Error posting grade to Canvas: ${error.message}`, 'error');
        }
    }

    buildCanvasFeedback(gradeResult) {
        const result = gradeResult.result || gradeResult;

        let feedback = `Auto-Graded Unity Assignment\n\n`;
        feedback += `Overall Grade: ${result.overallGrade}/50\n\n`;

        if (result.criteriaScores) {
            feedback += `Criteria Breakdown:\n`;
            Object.entries(result.criteriaScores).forEach(([key, criteria]) => {
                feedback += `• ${criteria.rating}: ${criteria.score}/${criteria.maxScore}\n`;
                feedback += `  ${criteria.feedback}\n\n`;
            });
        }

        if (result.overallFeedback) {
            feedback += `Overall Feedback:\n${result.overallFeedback.detailedFeedback}\n\n`;

            if (result.overallFeedback.strengths?.length > 0) {
                feedback += `Strengths:\n`;
                result.overallFeedback.strengths.forEach(strength => {
                    feedback += `• ${strength}\n`;
                });
                feedback += '\n';
            }

            if (result.overallFeedback.improvements?.length > 0) {
                feedback += `Areas for Improvement:\n`;
                result.overallFeedback.improvements.forEach(improvement => {
                    feedback += `• ${improvement}\n`;
                });
                feedback += '\n';
            }
        }

        feedback += `\n🤖 Generated with Unity Auto-Grader`;
        return feedback;
    }

    markAsResolved(index) {
        const result = this.gradingResults[index];
        if (!result) return;

        result.needsInstructorIntervention = false;
        result.resolvedByInstructor = true;
        result.resolvedAt = new Date().toISOString();

        this.showToast(`${result.studentName} marked as resolved`, 'success');
        this.loadGradingResults();
    }

    flagForReview(index) {
        const result = this.gradingResults[index];
        if (!result) return;

        result.needsInstructorIntervention = true;
        result.interventionReason = 'Manually flagged by instructor';

        this.showToast(`${result.studentName} flagged for instructor review`, 'warning');
        this.loadGradingResults();
    }

    async previewCriteria(index) {
        try {
            const templates = await window.electronAPI.store.get('criteria.templates') || [];
            if (index >= 0 && index < templates.length) {
                const template = templates[index];
                let preview = `**${template.name}**\n`;
                preview += `${template.description || ''}\n`;
                preview += `Total Points: ${template.totalPoints || 'Not specified'}\n\n`;

                template.items.forEach((item, i) => {
                    preview += `${i + 1}. ${item.name} (${item.points} pts)\n`;
                    preview += `   ${item.description}\n`;
                    if (item.ratings) {
                        item.ratings.forEach(rating => {
                            preview += `   • ${rating.name}: ${rating.points} pts - ${rating.description}\n`;
                        });
                    }
                    preview += '\n';
                });

                // For now, show in toast - in real app this would be a modal
                this.showToast(`Criteria preview would show: ${template.name}`, 'info');
                console.log('Criteria Preview:', preview);
            }
        } catch (error) {
            this.showToast(`Error previewing criteria: ${error.message}`, 'error');
        }
    }

    async clearAndLoadNewRubric() {
        try {
            // Clear existing templates
            await window.electronAPI.store.set('criteria.templates', []);

            // Load the new default rubric
            await this.loadDefaultCriteria();

            this.showToast('Rubric templates cleared and new default loaded!', 'success');
        } catch (error) {
            this.showToast(`Error clearing templates: ${error.message}`, 'error');
        }
    }

    // API Key Management Methods
    async loadSettingsPanel() {
        await this.loadSupportedProviders();
        await this.loadAPIKeys();
        await this.loadLatePenaltySettings();
    }

    async loadSupportedProviders() {
        try {
            const result = await window.electronAPI.apiKeys.getProviders();
            if (result.success) {
                this.supportedProviders = result.providers;
            }
        } catch (error) {
            console.error('Error loading supported providers:', error);
        }
    }

    async loadAPIKeys() {
        try {
            const result = await window.electronAPI.apiKeys.getAll();
            if (result.success) {
                this.displayAPIKeys(result.keys);
            } else {
                this.showToast(`Error loading API keys: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error loading API keys: ${error.message}`, 'error');
        }
    }

    displayAPIKeys(apiKeys) {
        const apiKeysList = document.getElementById('api-keys-list');

        if (!apiKeys || Object.keys(apiKeys).length === 0) {
            apiKeysList.innerHTML = '<p style="opacity: 0.7;">No API keys configured. Add your first API key above.</p>';
            return;
        }

        let html = '<div style="display: grid; gap: 16px;">';

        for (const [provider, config] of Object.entries(apiKeys)) {
            const providerInfo = config.providerInfo;
            const statusBadge = config.isActive
                ? '<span style="background: #2ecc71; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Active</span>'
                : '<span style="background: #95a5a6; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Inactive</span>';

            const lastUsed = config.lastUsed
                ? new Date(config.lastUsed).toLocaleDateString()
                : 'Never';

            const createdAt = config.createdAt
                ? new Date(config.createdAt).toLocaleDateString()
                : 'Unknown';

            html += `
                <div class="card" style="background: rgba(255,255,255,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div>
                            <h4 style="margin: 0; display: flex; align-items: center; gap: 8px;">
                                ${providerInfo.name}
                                ${statusBadge}
                            </h4>
                            <p style="margin: 4px 0; opacity: 0.8; font-size: 14px;">
                                API Key: ${config.apiKey || 'Not set'}
                            </p>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-secondary" onclick="app.editAPIKey('${provider}')" style="font-size: 12px; padding: 6px 12px;">Edit</button>
                            <button class="btn btn-secondary" onclick="app.testAPIKey('${provider}')" style="font-size: 12px; padding: 6px 12px;">Test</button>
                            <button class="btn btn-secondary" onclick="app.toggleAPIKey('${provider}', ${!config.isActive})" style="font-size: 12px; padding: 6px 12px;">
                                ${config.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button class="btn btn-secondary" onclick="app.deleteAPIKey('${provider}')" style="font-size: 12px; padding: 6px 12px; background: rgba(231, 76, 60, 0.2); border-color: #e74c3c;">Delete</button>
                        </div>
                    </div>
                    <div style="font-size: 12px; opacity: 0.6; display: flex; gap: 16px;">
                        <span>Created: ${createdAt}</span>
                        <span>Last Used: ${lastUsed}</span>
                        ${config.endpoint ? `<span>Endpoint: ${config.endpoint}</span>` : ''}
                    </div>
                </div>
            `;
        }

        html += '</div>';
        apiKeysList.innerHTML = html;
    }

    showAddAPIKeyForm() {
        this.currentEditingProvider = null;
        document.getElementById('api-form-title').textContent = 'Add New API Key';
        document.getElementById('api-key-form').style.display = 'block';
        this.resetAPIKeyForm();
    }

    hideAPIKeyForm() {
        document.getElementById('api-key-form').style.display = 'none';
        this.resetAPIKeyForm();
        this.currentEditingProvider = null;
    }

    resetAPIKeyForm() {
        document.getElementById('api-provider').value = '';
        document.getElementById('api-key-input').value = '';
        document.getElementById('api-endpoint').value = '';
        document.getElementById('api-deployment').value = '';
        document.getElementById('api-is-active').checked = true;
        this.onProviderChange();
    }

    onProviderChange() {
        const provider = document.getElementById('api-provider').value;
        const additionalFields = document.getElementById('additional-fields');
        const endpointField = document.getElementById('endpoint-field');
        const deploymentField = document.getElementById('deployment-field');

        // Hide all additional fields first
        additionalFields.style.display = 'none';
        endpointField.style.display = 'none';
        deploymentField.style.display = 'none';

        if (!provider) return;

        const providerInfo = this.supportedProviders[provider];
        if (!providerInfo) return;

        if (providerInfo.fields.includes('endpoint')) {
            additionalFields.style.display = 'block';
            endpointField.style.display = 'block';

            if (provider === 'azure') {
                document.getElementById('api-endpoint').placeholder = 'https://your-resource.openai.azure.com';
            } else if (provider === 'custom') {
                document.getElementById('api-endpoint').placeholder = 'https://your-api-endpoint.com';
            }
        }

        if (providerInfo.fields.includes('deploymentName')) {
            additionalFields.style.display = 'block';
            deploymentField.style.display = 'block';
        }
    }

    async saveAPIKey() {
        const provider = document.getElementById('api-provider').value;
        const apiKey = document.getElementById('api-key-input').value.trim();
        const endpoint = document.getElementById('api-endpoint').value.trim();
        const deployment = document.getElementById('api-deployment').value.trim();
        const isActive = document.getElementById('api-is-active').checked;

        if (!provider) {
            this.showToast('Please select a provider', 'warning');
            return;
        }

        if (!apiKey) {
            this.showToast('Please enter an API key', 'warning');
            return;
        }

        const config = {
            apiKey,
            isActive
        };

        const providerInfo = this.supportedProviders[provider];
        if (providerInfo && providerInfo.fields.includes('endpoint')) {
            if (!endpoint) {
                this.showToast('Please enter an endpoint URL', 'warning');
                return;
            }
            config.endpoint = endpoint;
        }

        if (providerInfo && providerInfo.fields.includes('deploymentName')) {
            if (!deployment) {
                this.showToast('Please enter a deployment name', 'warning');
                return;
            }
            config.deploymentName = deployment;
        }

        try {
            this.showToast('Saving API key...', 'info');
            // Ensure config is serializable
            const serializableConfig = JSON.parse(JSON.stringify(config));
            const result = await window.electronAPI.apiKeys.set(provider, serializableConfig);

            if (result.success) {
                this.showToast(result.message, 'success');
                this.hideAPIKeyForm();
                await this.loadAPIKeys();

                // Refresh LLM status since we may have just activated a new provider
                await this.refreshLLMStatus();
            } else {
                this.showToast(`Error saving API key: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error saving API key: ${error.message}`, 'error');
        }
    }

    async editAPIKey(provider) {
        try {
            const result = await window.electronAPI.apiKeys.get(provider);
            if (result.success && result.keyData) {
                this.currentEditingProvider = provider;
                const keyData = result.keyData;

                document.getElementById('api-form-title').textContent = `Edit ${this.supportedProviders[provider].name} API Key`;
                document.getElementById('api-provider').value = provider;
                document.getElementById('api-key-input').value = keyData.apiKey || '';
                document.getElementById('api-endpoint').value = keyData.endpoint || '';
                document.getElementById('api-deployment').value = keyData.deploymentName || '';
                document.getElementById('api-is-active').checked = keyData.isActive !== false;

                this.onProviderChange();
                document.getElementById('api-key-form').style.display = 'block';
            }
        } catch (error) {
            this.showToast(`Error loading API key: ${error.message}`, 'error');
        }
    }

    async deleteAPIKey(provider) {
        const providerName = this.supportedProviders[provider]?.name || provider;

        if (!confirm(`Are you sure you want to delete the API key for ${providerName}?`)) {
            return;
        }

        try {
            const result = await window.electronAPI.apiKeys.delete(provider);
            if (result.success) {
                this.showToast(result.message, 'success');
                await this.loadAPIKeys();
            } else {
                this.showToast(`Error deleting API key: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error deleting API key: ${error.message}`, 'error');
        }
    }

    async testAPIKey(provider) {
        try {
            this.showToast('Testing API key...', 'info');
            const result = await window.electronAPI.apiKeys.test(provider);

            if (result.success) {
                let message = result.message;
                if (result.models && result.models.length > 0) {
                    message += ` (Models: ${result.models.slice(0, 3).join(', ')})`;
                }
                this.showToast(message, 'success');
            } else {
                this.showToast(`API key test failed: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error testing API key: ${error.message}`, 'error');
        }
    }

    async testCurrentAPIKey() {
        const provider = document.getElementById('api-provider').value;
        const apiKey = document.getElementById('api-key-input').value.trim();
        const endpoint = document.getElementById('api-endpoint').value.trim();
        const deployment = document.getElementById('api-deployment').value.trim();

        if (!provider || !apiKey) {
            this.showToast('Please fill in the provider and API key fields first', 'warning');
            return;
        }

        const config = { apiKey };

        const providerInfo = this.supportedProviders[provider];
        if (providerInfo && providerInfo.fields.includes('endpoint') && endpoint) {
            config.endpoint = endpoint;
        }
        if (providerInfo && providerInfo.fields.includes('deploymentName') && deployment) {
            config.deploymentName = deployment;
        }

        try {
            this.showToast('Testing API key...', 'info');
            // Ensure config is serializable
            const serializableConfig = JSON.parse(JSON.stringify(config));
            const result = await window.electronAPI.apiKeys.test(provider, serializableConfig);

            if (result.success) {
                let message = result.message;
                if (result.models && result.models.length > 0) {
                    message += ` (Models: ${result.models.slice(0, 3).join(', ')})`;
                }
                this.showToast(message, 'success');
            } else {
                this.showToast(`API key test failed: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error testing API key: ${error.message}`, 'error');
        }
    }

    async toggleAPIKey(provider, isActive) {
        try {
            const result = await window.electronAPI.apiKeys.toggle(provider, isActive);
            if (result.success) {
                const action = isActive ? 'activated' : 'deactivated';
                this.showToast(`${this.supportedProviders[provider].name} ${action}`, 'success');
                await this.loadAPIKeys();
            } else {
                this.showToast(`Error toggling API key: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error toggling API key: ${error.message}`, 'error');
        }
    }

    async exportAPIKeyConfig() {
        try {
            const result = await window.electronAPI.apiKeys.exportConfig();
            if (result.success) {
                const config = result.config;
                const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `api-keys-config-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                this.showToast('API key configuration exported successfully', 'success');
            } else {
                this.showToast(`Error exporting configuration: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error exporting configuration: ${error.message}`, 'error');
        }
    }

    async refreshLLMStatus() {
        try {
            this.showToast('Refreshing LLM status...', 'info');

            // Refresh the provider
            await window.electronAPI.llm.refreshProvider();

            // Check status again
            await this.checkLLMStatus();

            this.showToast('LLM status refreshed', 'success');
        } catch (error) {
            this.showToast(`Error refreshing LLM status: ${error.message}`, 'error');
        }
    }

    // Late Penalty Settings Methods
    toggleLatePenalty() {
        const enabled = document.getElementById('late-penalty-enabled').checked;
        const config = document.getElementById('late-penalty-config');

        if (enabled) {
            config.style.display = 'block';
        } else {
            config.style.display = 'none';
        }

        this.updateLatePenaltyExample();
    }

    updateLatePenaltyExample() {
        const penaltyPerDay = parseInt(document.getElementById('penalty-per-day').value) || 10;
        const maxPenalty = parseInt(document.getElementById('max-penalty').value) || 50;
        const gracePeriod = parseInt(document.getElementById('grace-period').value) || 0;

        const exampleDays = 3;
        let calculatedPenalty = exampleDays * penaltyPerDay;
        if (calculatedPenalty > maxPenalty) {
            calculatedPenalty = maxPenalty;
        }

        const exampleElement = document.getElementById('late-penalty-example');
        let exampleText = `If a student submits ${exampleDays} days late with ${penaltyPerDay}% per day penalty, they lose ${calculatedPenalty}% of their grade.`;

        if (gracePeriod > 0) {
            exampleText += ` Grace period: ${gracePeriod} hours.`;
        }

        if (calculatedPenalty >= maxPenalty) {
            exampleText += ` (Capped at maximum ${maxPenalty}%)`;
        }

        exampleElement.textContent = exampleText;
    }

    async saveLatePenaltySettings() {
        try {
            const settings = {
                enabled: document.getElementById('late-penalty-enabled').checked,
                penaltyPerDay: parseInt(document.getElementById('penalty-per-day').value) || 10,
                maxPenalty: parseInt(document.getElementById('max-penalty').value) || 50,
                gracePeriodHours: parseInt(document.getElementById('grace-period').value) || 0
            };

            const result = await window.electronAPI.latePenalty.saveSettings(settings);

            if (result.success) {
                this.showToast('Late penalty settings saved successfully', 'success');
            } else {
                this.showToast(`Error saving settings: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error saving late penalty settings: ${error.message}`, 'error');
        }
    }

    async loadLatePenaltySettings() {
        try {
            const result = await window.electronAPI.latePenalty.getSettings();

            if (result.success && result.settings) {
                const settings = result.settings;

                document.getElementById('late-penalty-enabled').checked = settings.enabled || false;
                document.getElementById('penalty-per-day').value = settings.penaltyPerDay || 10;
                document.getElementById('max-penalty').value = settings.maxPenalty || 50;
                document.getElementById('grace-period').value = settings.gracePeriodHours || 0;

                // Show/hide config based on enabled state
                const config = document.getElementById('late-penalty-config');
                config.style.display = settings.enabled ? 'block' : 'none';

                this.updateLatePenaltyExample();
            }
        } catch (error) {
            console.error('Error loading late penalty settings:', error);
        }
    }

    async refreshSavedResults() {
        console.log('🔄 Refreshing saved results...');
        this.gradingResults = []; // Clear current results
        await this.loadGradingResults(); // Reload from storage
        this.showToast('Results refreshed from storage', 'success');
    }

    async clearAllResults() {
        const confirmed = confirm('Are you sure you want to clear ALL saved grading results? This cannot be undone.');

        if (!confirmed) return;

        try {
            const result = await window.electronAPI.results.clear();

            if (result.success) {
                this.gradingResults = [];
                this.loadGradingResults();
                this.showToast('All results cleared', 'success');
                console.log('✅ All results cleared');
            } else {
                this.showToast(`Failed to clear results: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error clearing results: ${error.message}`, 'error');
        }
    }

    async updateSavedResultsInfo() {
        try {
            const result = await window.electronAPI.results.load();

            if (result.success) {
                const count = result.results.length;
                const infoElement = document.getElementById('saved-results-info');

                if (infoElement) {
                    if (count === 0) {
                        infoElement.textContent = 'No saved results yet';
                    } else {
                        const mostRecent = result.results[result.results.length - 1];
                        const savedDate = mostRecent?.savedAt ? new Date(mostRecent.savedAt).toLocaleDateString() : 'Unknown';
                        infoElement.textContent = `${count} result${count !== 1 ? 's' : ''} saved • Last saved: ${savedDate}`;
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error updating saved results info:', error);
        }
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }
}

// Global functions for HTML onclick handlers
window.showPanel = (panel) => window.app.showPanel(panel);
window.testCanvasConnection = () => window.app.testCanvasConnection();
window.createNewCriteria = () => window.app.showToast('Criteria builder coming soon!', 'info');
window.loadDefaultCriteria = () => window.app.loadDefaultCriteria();
window.editCriteria = (index) => window.app.editCriteria(index);
window.deleteCriteria = (index) => window.app.deleteCriteria(index);
window.loadAssignments = () => window.app.loadAssignments();
window.gradeAssignment = (courseId, assignmentId) => window.app.gradeAssignment(courseId, assignmentId);
window.startBatchGrading = () => window.app.startBatchGrading();
window.startBatchGradingFromAssignments = () => window.app.startBatchGradingFromAssignments();
window.cancelBatchGrading = () => window.app.cancelBatchGrading();
window.startIndividualGrading = () => window.app.startIndividualGrading();
window.cancelGrading = () => window.app.resetGradingUI();
window.exportResults = (format) => window.app.exportResults(format);
window.refreshLLMStatus = () => window.app.refreshLLMStatus();
window.filterResults = (filter) => window.app.filterResults(filter);
window.openCanvasGradebook = () => window.app.openCanvasGradebook();
window.clearAndLoadNewRubric = () => window.app.clearAndLoadNewRubric();

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new UnityAutoGraderApp();
});