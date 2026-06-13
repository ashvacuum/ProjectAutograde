// Grading methods, mixed onto the app via (Base) => class extends Base.
// Moved verbatim from renderer.js; run with the same `this`.
export default (Base) => class extends Base {
    async loadGradingCourses() {
        try {
            const result = await window.electronAPI.canvas.getCourses();
            if (result.success) {
                const select = document.getElementById('grading-course-select');
                select.innerHTML = '<option value="">Select Course</option>';

                result.courses.forEach(course => {
                    const option = document.createElement('option');
                    option.value = course.id;
                    option.textContent = this.formatCourseLabel(course);
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

    // Build a course dropdown label that includes the enrollment term, so
    // courses reused across terms are distinguishable. Canvas returns the term
    // under `term` (requires include[]=term) or sometimes `enrollment_term_id`.
    formatCourseLabel(course) {
        const termName = course.term && course.term.name ? course.term.name : null;
        // Canvas uses "Default Term" / "The End of Time" for the catch-all term;
        // showing it adds noise, so only append a real, named term.
        if (termName && !/^default term$/i.test(termName)) {
            return `${course.name} (${termName})`;
        }
        return course.name;
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
                    option.textContent = this.formatCourseLabel(course);
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
                        <input type="checkbox" id="batch-skip-graded" style="margin: 0;" checked>
                        Skip already-graded submissions
                    </label>
                    <small style="margin-left: 24px; opacity: 0.7; display: block; margin-top: 4px;">
                        Uncheck to regrade all submissions
                    </small>
                </div>

                <div style="display: flex; gap: 12px; align-items: center;">
                    <button class="btn" onclick="app.startBatchGradingFromAssignments()" id="start-batch-grading-from-assignments-btn" disabled>
                        Start Batch Grading (<span id="ungraded-count">${submissions.length}</span>/<span id="total-count">${submissions.length}</span> submissions)
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

        // Update submission counts when skip-graded checkbox changes
        const skipGradedCheckbox = document.getElementById('batch-skip-graded');
        const updateCounts = () => {
            // Count ungraded submissions (those with score <= 0, since Canvas defaults to 0)
            const ungradedCount = submissions.filter(sub => {
                const score = parseFloat(sub.score);
                const hasPositiveScore = !isNaN(score) && score > 0;
                return !hasPositiveScore; // Count as ungraded if score is 0 or not set
            }).length;

            const ungradedCountSpan = document.getElementById('ungraded-count');
            const totalCountSpan = document.getElementById('total-count');

            if (skipGradedCheckbox && skipGradedCheckbox.checked) {
                if (ungradedCountSpan) ungradedCountSpan.textContent = ungradedCount;
            } else {
                if (ungradedCountSpan) ungradedCountSpan.textContent = submissions.length;
            }
            if (totalCountSpan) totalCountSpan.textContent = submissions.length;
        };

        if (skipGradedCheckbox) {
            skipGradedCheckbox.addEventListener('change', updateCounts);
            updateCounts(); // Initial update
        }
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
        const skipGraded = document.getElementById('batch-skip-graded')?.checked ?? true;

        console.log('=== BATCH GRADING START ===');
        console.log('Criteria ID:', criteriaId);
        console.log('Instructions:', instructions);
        console.log('Skip Already Graded:', skipGraded);
        console.log('Current Assignment:', this.currentAssignment);

        if (!criteriaId) {
            this.showToast('Please select grading criteria', 'warning');
            return;
        }

        if (!this.currentAssignment) {
            this.showToast('No assignment selected for grading', 'error');
            return;
        }

        // Filter submissions based on skip-graded setting
        let submissionsToGrade = this.currentAssignment.submissions;
        if (skipGraded) {
            const originalCount = submissionsToGrade.length;
            console.log(`📊 Checking ${originalCount} submissions for existing grades...`);

            // A submission is considered "needs grading" if:
            // 1. Score is 0 (could be ungraded or legitimate fail - better to regrade)
            // 2. Score is null/undefined (definitely not graded)
            // Skip only if score > 0 (has been meaningfully graded)
            submissionsToGrade = submissionsToGrade.filter((sub, idx) => {
                const score = parseFloat(sub.score);
                const hasPositiveScore = !isNaN(score) && score > 0;

                if (hasPositiveScore) {
                    console.log(`  ⏭️  Skipping ${sub.user?.name || 'Unknown'}: score=${sub.score} (already graded with score > 0)`);
                    return false; // Skip - has been graded with a real score
                }

                // Include submissions with score=0 or no score
                console.log(`  📝 Including ${sub.user?.name || 'Unknown'}: score=${sub.score} (will grade/regrade)`);
                return true; // Keep for grading
            });
            const skippedCount = originalCount - submissionsToGrade.length;

            console.log(`📊 Result: ${submissionsToGrade.length} ungraded / ${originalCount} total`);
            console.log(`⏭️  Skipped ${skippedCount} already-graded submission(s)`);

            if (submissionsToGrade.length === 0) {
                this.showToast('All submissions have already been graded. Uncheck "Skip already-graded" to regrade.', 'info');
                return;
            }
        }

        try {
            console.log(`📊 Starting batch grading for ${submissionsToGrade.length} submissions`);
            this.showToast(`Starting batch grading for ${submissionsToGrade.length} submission(s)...`, 'info');

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

            // Process submissions (filtered or all)
            this.gradingResults = [];

            for (let i = 0; i < submissionsToGrade.length; i++) {
                const submission = submissionsToGrade[i];
                const progress = ((i + 1) / submissionsToGrade.length) * 100;

                console.log(`\n--- Processing Submission ${i + 1}/${submissionsToGrade.length} ---`);
                console.log('Student:', submission.user?.name || 'Unknown');
                console.log('User ID:', submission.user_id);

                // Calculate stats from completed results
                const completedResults = this.gradingResults.filter(r => r.grade);
                const totalScore = completedResults.reduce((sum, r) => {
                    const score = r.grade.overallGrade !== undefined ? r.grade.overallGrade :
                                  r.grade.result?.overallGrade !== undefined ? r.grade.result.overallGrade : 0;
                    return sum + score;
                }, 0);
                const averageScore = completedResults.length > 0 ? totalScore / completedResults.length : 0;
                const errorCount = this.gradingResults.filter(r => r.error).length;
                const needsReviewCount = this.gradingResults.filter(r => r.needsInstructorIntervention).length;

                // Update progress with stats
                const progressFill = document.getElementById('batch-progress-fill');
                const progressText = document.getElementById('batch-progress-text');

                if (progressFill) progressFill.style.width = `${progress}%`;
                if (progressText) {
                    progressText.innerHTML = `
                        <div>
                            <p><strong>Grading ${submission.user?.name || 'Unknown'} (${i + 1}/${submissionsToGrade.length})</strong></p>
                            ${i > 0 ? `
                                <p style="margin-top: 10px; font-size: 14px;">
                                    Avg Score: ${averageScore.toFixed(1)}/50 |
                                    Errors: <span style="color: ${errorCount > 0 ? '#e74c3c' : '#2ecc71'};">${errorCount}</span> |
                                    Needs Review: <span style="color: ${needsReviewCount > 0 ? '#f39c12' : '#2ecc71'};">${needsReviewCount}</span>
                                </p>
                            ` : ''}
                        </div>
                    `;
                }

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

                            // Check for duplicates before adding
                            const existingIndex = this.gradingResults.findIndex(r =>
                                r.userId === submission.user_id &&
                                r.courseId === this.currentAssignment.courseId &&
                                r.assignmentId === this.currentAssignment.assignmentId
                            );

                            const resultData = {
                                studentName: submission.user?.name || 'Unknown Student',
                                userId: submission.user_id,
                                studentId: submission.user_id,
                                githubUrl,
                                grade: result.grade,
                                result: result.analysis,
                                latePenalty: result.latePenalty,
                                needsInstructorIntervention: result.needsInstructorIntervention || false,
                                interventionReason: result.interventionReason || null,
                                errorType: result.errorType || null,
                                courseId: this.currentAssignment.courseId,
                                assignmentId: this.currentAssignment.assignmentId
                            };

                            if (existingIndex >= 0) {
                                console.log(`♻️  Replacing existing result for ${resultData.studentName}`);
                                this.gradingResults[existingIndex] = resultData;
                            } else {
                                this.gradingResults.push(resultData);
                            }
                        } else {
                            console.error('❌ Analysis failed:', result.error);

                            // Show error notification for this specific submission
                            const studentName = submission.user?.name || 'Unknown Student';
                            this.showToast(`Failed to grade ${studentName}: ${result.error}`, 'error');

                            // Check for duplicates before adding
                            const existingIndex = this.gradingResults.findIndex(r =>
                                r.userId === submission.user_id &&
                                r.courseId === this.currentAssignment.courseId &&
                                r.assignmentId === this.currentAssignment.assignmentId
                            );

                            const errorData = {
                                studentName,
                                userId: submission.user_id,
                                studentId: submission.user_id,
                                githubUrl,
                                error: result.error || 'Analysis failed',
                                needsInstructorIntervention: true,
                                interventionReason: result.interventionReason || 'Analysis returned failure',
                                errorType: result.errorType || 'analysis_failed',
                                courseId: this.currentAssignment.courseId,
                                assignmentId: this.currentAssignment.assignmentId
                            };

                            // Auto-post 0.1 score for private/inaccessible repositories
                            if (result.errorType === 'private_repo' || result.errorType === 'not_found') {
                                console.log(`🔒 Auto-posting 0.1 score for inaccessible repository: ${studentName}`);
                                try {
                                    const comment = result.errorType === 'private_repo'
                                        ? 'Your repository is private or inaccessible. Please make it public and resubmit. Scored 0.1 until repository is accessible.'
                                        : 'Repository not found or URL is incorrect. Please verify your GitHub URL and resubmit. Scored 0.1 until valid repository is provided.';

                                    await window.electronAPI.canvas.postGrade(
                                        this.currentAssignment.courseId,
                                        this.currentAssignment.assignmentId,
                                        submission.user_id,
                                        0.1,
                                        comment
                                    );

                                    errorData.autoPosted = true;
                                    errorData.postedScore = 0.1;
                                    console.log(`✅ Auto-posted 0.1 score to Canvas for ${studentName}`);
                                } catch (postError) {
                                    console.error(`❌ Failed to auto-post grade for ${studentName}:`, postError);
                                    errorData.autoPostError = postError.message;
                                }
                            }

                            if (existingIndex >= 0) {
                                console.log(`♻️  Replacing existing error result for ${errorData.studentName}`);
                                this.gradingResults[existingIndex] = errorData;
                            } else {
                                this.gradingResults.push(errorData);
                            }
                        }
                    } catch (error) {
                        console.error(`❌ Error grading ${githubUrl}:`, error);
                        console.error('Error stack:', error.stack);

                        // Show error notification for this specific submission
                        const studentName = submission.user?.name || 'Unknown Student';
                        this.showToast(`Error grading ${studentName}: ${error.message}`, 'error');

                        // Check for duplicates before adding
                        const existingIndex = this.gradingResults.findIndex(r =>
                            r.userId === submission.user_id &&
                            r.courseId === this.currentAssignment.courseId &&
                            r.assignmentId === this.currentAssignment.assignmentId
                        );

                        const exceptionData = {
                            studentName,
                            userId: submission.user_id,
                            studentId: submission.user_id,
                            githubUrl,
                            error: error.message,
                            needsInstructorIntervention: true,
                            interventionReason: 'Grading error occurred',
                            courseId: this.currentAssignment.courseId,
                            assignmentId: this.currentAssignment.assignmentId
                        };

                        if (existingIndex >= 0) {
                            console.log(`♻️  Replacing existing exception result for ${exceptionData.studentName}`);
                            this.gradingResults[existingIndex] = exceptionData;
                        } else {
                            this.gradingResults.push(exceptionData);
                        }
                    }
                } else {
                    console.log(`⏭️  Skipping submission ${i + 1} - no GitHub URL`);
                }
            }

            // Count successful and failed gradings
            const successCount = this.gradingResults.filter(r => r.grade && !r.error).length;
            const errorCount = this.gradingResults.filter(r => r.error).length;

            // Show appropriate message based on results
            if (errorCount === 0) {
                this.showToast(`Batch grading completed successfully! Processed ${successCount} submissions`, 'success');
            } else if (successCount === 0) {
                this.showToast(`Batch grading failed! All ${errorCount} submissions had errors. Check the results panel for details.`, 'error');
            } else {
                this.showToast(`Batch grading completed with ${successCount} successful and ${errorCount} failed submissions. Check the results panel for details.`, 'warning');
            }

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

                // Check for duplicates before adding
                const existingIndex = this.gradingResults.findIndex(r =>
                    r.studentId === studentId &&
                    r.courseId === courseId &&
                    r.assignmentId === assignmentId
                );

                const resultData = {
                    studentName: submissionData.user?.name || submissionData.user?.sortable_name || `User ${studentId}`,
                    studentId: studentId,
                    submissionId: submissionData.id,
                    githubUrl: githubUrl,
                    grade: result.grade,
                    analysis: result.analysis,
                    latePenalty: result.latePenalty,
                    submittedAt: submissionData.submitted_at,
                    courseId: courseId,
                    assignmentId: assignmentId,
                    needsInstructorIntervention: result.needsInstructorIntervention || false,
                    interventionReason: result.interventionReason || null,
                    errorType: result.errorType || null
                };

                if (existingIndex >= 0) {
                    console.log(`♻️  Replacing existing result for ${resultData.studentName}`);
                    this.gradingResults[existingIndex] = resultData;
                } else {
                    console.log(`➕ Adding new result for ${resultData.studentName}`);
                    this.gradingResults.push(resultData);
                }

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

                // Auto-post 0.1 score for private/inaccessible repositories
                if (result.errorType === 'private_repo' || result.errorType === 'not_found') {
                    console.log(`🔒 Auto-posting 0.1 score for inaccessible repository`);
                    try {
                        const comment = result.errorType === 'private_repo'
                            ? 'Your repository is private or inaccessible. Please make it public and resubmit. Scored 0.1 until repository is accessible.'
                            : 'Repository not found or URL is incorrect. Please verify your GitHub URL and resubmit. Scored 0.1 until valid repository is provided.';

                        await window.electronAPI.canvas.postGrade(
                            courseId,
                            assignmentId,
                            studentId,
                            0.1,
                            comment
                        );

                        console.log(`✅ Auto-posted 0.1 score to Canvas`);
                        this.showToast('Posted 0.1 score for inaccessible repository', 'info');
                    } catch (postError) {
                        console.error(`❌ Failed to auto-post grade:`, postError);
                        this.showToast(`Failed to post grade: ${postError.message}`, 'error');
                    }
                }
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
            // Calculate stats
            const completed = progress.current - 1; // Current is the one being processed
            const stats = progress.stats || {
                totalGraded: 0,
                averageScore: 0,
                errorCount: 0,
                needsReviewCount: 0
            };

            progressText.innerHTML = `
                <div style="padding: 15px; background: rgba(52, 152, 219, 0.1); border-radius: 8px;">
                    <h3 style="margin: 0 0 10px 0; color: #3498db;">Grading Progress</h3>
                    <p style="margin: 5px 0;"><strong>Status:</strong> ${progress.current}/${progress.total} submissions</p>
                    <p style="margin: 5px 0;"><strong>Current:</strong> ${progress.currentStudent || 'Processing...'}</p>
                    ${completed > 0 ? `
                        <hr style="margin: 10px 0; border: none; border-top: 1px solid rgba(52, 152, 219, 0.3);">
                        <h4 style="margin: 10px 0 5px 0; color: #2c3e50;">Statistics</h4>
                        <p style="margin: 5px 0;"><strong>Completed:</strong> ${completed}</p>
                        <p style="margin: 5px 0;"><strong>Average Score:</strong> ${stats.averageScore ? stats.averageScore.toFixed(1) : 'N/A'}/50</p>
                        <p style="margin: 5px 0;"><strong>Errors:</strong> <span style="color: ${stats.errorCount > 0 ? '#e74c3c' : '#2ecc71'};">${stats.errorCount}</span></p>
                        <p style="margin: 5px 0;"><strong>Needs Review:</strong> <span style="color: ${stats.needsReviewCount > 0 ? '#f39c12' : '#2ecc71'};">${stats.needsReviewCount}</span></p>
                    ` : ''}
                </div>
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
};
