// Results methods, mixed onto the app via (Base) => class extends Base.
// Moved verbatim from renderer.js; run with the same `this`.
export default (Base) => class extends Base {
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
                            result.postedToCanvas && !result.regraded ?
                            `<button class="btn" disabled style="margin-left: 8px; opacity: 0.5; cursor: not-allowed;" title="Already posted to Canvas">Posted to Canvas</button>` :
                            `<button class="btn" onclick="app.postGradeToCanvas(${originalIndex})" style="margin-left: 8px;">${result.postedToCanvas ? 'Re-post' : 'Post'} to Canvas</button>`
                        }
                        ${(result.errorType === 'private_repo' || result.errorType === 'not_found') && !result.commentPosted ?
                            `<button class="btn" onclick="app.postInaccessibleComment(${originalIndex})" style="margin-left: 8px; background: #f39c12;">Comment on Access Issue</button>` :
                            ''
                        }
                        <button class="btn btn-secondary" onclick="app.regradeSubmission(${originalIndex})" style="margin-left: 8px;">Regrade</button>
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

        const modal = document.getElementById('details-modal');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');

        modalTitle.textContent = `Grading Details: ${result.studentName || 'Unknown Student'}`;

        let detailsHtml = '';

        // Error/Intervention Notice
        if (result.needsInstructorIntervention) {
            const errorTypeIcons = {
                'invalid_url': '🔗',
                'not_found': '❌',
                'private_repo': '🔒',
                'clone_failed': '📥',
                'invalid_project': '📂',
                'error': '⚠️',
                'analysis_failed': '⚠️'
            };

            const icon = errorTypeIcons[result.errorType] || '⚠️';

            detailsHtml += `
                <div style="background: rgba(231, 76, 60, 0.2); padding: 16px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #e74c3c;">
                    <strong style="font-size: 16px;">${icon} Requires Instructor Review</strong><br>
                    <p style="margin: 12px 0 0 0; font-size: 14px;">
                        <strong>Issue:</strong> ${result.interventionReason || 'Unknown'}
                    </p>
                    ${result.errorType === 'private_repo' ? `
                        <p style="margin: 12px 0 0 0; font-size: 13px; opacity: 0.9; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px;">
                            <strong>Action Required:</strong> Contact the student to make their repository public or grant instructor access.
                        </p>
                    ` : ''}
                    ${result.error ? `<p style="margin: 12px 0 0 0; font-size: 12px; opacity: 0.7;">Technical Error: ${result.error}</p>` : ''}
                </div>
            `;
        }

        // Non-Standard Structure Notice
        const analysisData = result.result || result.analysis;
        if (analysisData && analysisData.structure && analysisData.structure.isNonStandard) {
            detailsHtml += `
                <div style="background: rgba(241, 196, 15, 0.2); padding: 16px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #f1c40f;">
                    <strong style="font-size: 16px;">ℹ️ Non-Standard Project Structure</strong><br>
                    <p style="margin: 12px 0 0 0; font-size: 14px;">
                        ${analysisData.structure.nonStandardReason}
                    </p>
                    <p style="margin: 8px 0 0 0; font-size: 13px; opacity: 0.9;">
                        This submission was evaluated based on the C# code files present. Folder structure was not a factor in grading.
                    </p>
                </div>
            `;
        }

        // Grade Information
        if (result.grade) {
            const grade = result.grade;

            // Grade Summary
            detailsHtml += `
                <div class="grade-summary">
                    <div style="margin-bottom: 8px; opacity: 0.7; font-size: 14px;">Overall Grade</div>
                    <div>
                        <span class="main-grade">${grade.overallGrade}</span>
                        <span class="max-grade">/ ${grade.maxPoints || 50}</span>
                    </div>
                </div>
            `;

            // Late Penalty Notice
            if (result.latePenalty && result.latePenalty.isLate) {
                const penalty = result.latePenalty;
                detailsHtml += `
                    <div class="late-penalty-notice">
                        <strong>⏰ Late Submission Penalty Applied</strong><br>
                        <div style="margin-top: 8px;">
                            Submitted ${penalty.daysLate} day${penalty.daysLate > 1 ? 's' : ''} late
                            • ${penalty.penaltyPercentage}% deducted
                            ${penalty.cappedAtMax ? ' (capped at maximum penalty)' : ''}
                        </div>
                    </div>
                `;
            }

            // Criteria Breakdown
            if (grade.criteriaScores) {
                detailsHtml += `<h3 style="margin: 24px 0 16px 0; font-size: 18px;">Criteria Breakdown</h3>`;

                Object.entries(grade.criteriaScores).forEach(([key, criteria]) => {
                    const criteriaName = criteria.rating || criteria.name || key.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    const percentage = criteria.maxScore > 0 ? Math.round((criteria.score / criteria.maxScore) * 100) : 0;

                    detailsHtml += `
                        <div class="criteria-card">
                            <div class="criteria-header">
                                <div class="criteria-title">${criteriaName}</div>
                                <div class="criteria-score">${criteria.score}/${criteria.maxScore} <span style="font-size: 14px; opacity: 0.7;">(${percentage}%)</span></div>
                            </div>

                            <div class="criteria-feedback">
                                ${criteria.feedback || 'No feedback provided'}
                            </div>

                            ${criteria.evidenceFound && criteria.evidenceFound.length > 0 ? `
                                <div class="criteria-section">
                                    <div class="criteria-section-title">✓ Evidence Found:</div>
                                    <ul class="criteria-list">
                                        ${criteria.evidenceFound.map(evidence => `<li>${evidence}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}

                            ${criteria.improvementAreas && criteria.improvementAreas.length > 0 ? `
                                <div class="criteria-section">
                                    <div class="criteria-section-title">💡 Areas for Improvement:</div>
                                    <ul class="criteria-list">
                                        ${criteria.improvementAreas.map(area => `<li>${area}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                        </div>
                    `;
                });
            }

            // Overall Feedback
            if (grade.overallFeedback) {
                detailsHtml += `
                    <div class="overall-feedback">
                        <h3 style="margin: 0 0 12px 0; font-size: 18px;">Overall Feedback</h3>
                        <div style="font-size: 14px; line-height: 1.6;">
                            ${grade.overallFeedback.detailedFeedback || grade.overallFeedback.summary || grade.overallFeedback}
                        </div>
                        ${grade.overallFeedback.strengths ? `
                            <div style="margin-top: 16px;">
                                <strong style="font-size: 14px;">Strengths:</strong>
                                <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">${grade.overallFeedback.strengths}</p>
                            </div>
                        ` : ''}
                        ${grade.overallFeedback.weaknesses ? `
                            <div style="margin-top: 16px;">
                                <strong style="font-size: 14px;">Areas to Improve:</strong>
                                <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">${grade.overallFeedback.weaknesses}</p>
                            </div>
                        ` : ''}
                    </div>
                `;
            }

            // GitHub Link
            if (result.githubUrl) {
                detailsHtml += `
                    <div style="margin-top: 24px; padding: 16px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                        <strong style="font-size: 14px;">Repository:</strong>
                        <a href="${result.githubUrl}" target="_blank" style="color: var(--ciit-light); text-decoration: none; margin-left: 8px; font-size: 14px;">
                            ${result.githubUrl}
                        </a>
                    </div>
                `;
            }
        } else {
            detailsHtml += `
                <div style="padding: 40px; text-align: center; opacity: 0.7;">
                    <p>No detailed grading information available for this submission.</p>
                </div>
            `;
        }

        modalBody.innerHTML = detailsHtml;
        modal.classList.add('show');

        // Close on background click
        modal.onclick = (e) => {
            if (e.target === modal) {
                this.closeDetailsModal();
            }
        };
    }

    closeDetailsModal() {
        const modal = document.getElementById('details-modal');
        modal.classList.remove('show');
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
        if (!result) {
            this.showToast('Cannot open Canvas submission - result not found', 'error');
            return;
        }

        // Use courseId/assignmentId from the result itself (stored when graded)
        const courseId = result.courseId;
        const assignmentId = result.assignmentId;
        const userId = result.studentId || result.userId;

        if (!courseId || !assignmentId || !userId) {
            this.showToast('Cannot open Canvas submission - missing course/assignment/user ID', 'error');
            console.error('Missing data:', { courseId, assignmentId, userId, result });
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
            const submissionUrl = `${baseUrl}/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`;

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
        console.log('Has result.userId:', !!result?.userId);
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
        let courseId, assignmentId, userId;

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

        // Get user ID - check both studentId (individual grading) and userId (batch grading)
        userId = result.studentId || result.userId;

        if (!userId) {
            console.error('❌ No user ID found in result');
            this.showToast('Cannot post grade - missing student/user ID', 'error');
            return;
        }

        console.log('Course ID:', courseId);
        console.log('Assignment ID:', assignmentId);
        console.log('User ID:', userId);

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
                userId,
                grade,
                feedback
            );

            console.log('📥 Canvas API Response:', postResult);

            if (postResult.success) {
                console.log('✅ Grade posted successfully');
                this.showToast(`Grade posted to Canvas for ${result.studentName}`, 'success');
                result.postedToCanvas = true;
                result.regraded = false; // Clear regraded flag after posting
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

    async postInaccessibleComment(index) {
        const result = this.gradingResults[index];

        if (!result) {
            this.showToast('Cannot post comment - no result found', 'error');
            return;
        }

        // Get course/assignment info
        let courseId, assignmentId, userId;

        if (result.courseId && result.assignmentId) {
            courseId = result.courseId;
            assignmentId = result.assignmentId;
        } else if (this.currentAssignment) {
            courseId = this.currentAssignment.courseId;
            assignmentId = this.currentAssignment.assignmentId;
        } else {
            this.showToast('Cannot post comment - missing course/assignment info', 'error');
            return;
        }

        userId = result.studentId || result.userId;

        if (!userId) {
            this.showToast('Cannot post comment - missing student/user ID', 'error');
            return;
        }

        try {
            const comment = result.errorType === 'private_repo'
                ? '⚠️ Your GitHub repository appears to be private or inaccessible. Please make your repository public and verify the link is correct. If you need help, please reach out during office hours.'
                : '⚠️ Your GitHub repository could not be accessed. Please verify the link is correct and the repository is public. If you continue to have issues, please reach out for assistance.';

            const postResult = await window.electronAPI.canvas.postComment(
                courseId,
                assignmentId,
                userId,
                comment
            );

            if (postResult.success) {
                this.showToast(`Comment posted to ${result.studentName}'s submission`, 'success');
                result.commentPosted = true;
                this.loadGradingResults(); // Refresh display
            } else {
                this.showToast(`Failed to post comment: ${postResult.error}`, 'error');
            }

        } catch (error) {
            this.showToast(`Error posting comment: ${error.message}`, 'error');
        }
    }

    async regradeSubmission(index) {
        const result = this.gradingResults[index];

        if (!result) {
            this.showToast('Cannot regrade - result not found', 'error');
            return;
        }

        if (!result.githubUrl) {
            this.showToast('Cannot regrade - no GitHub URL', 'error');
            return;
        }

        console.log('\n========================================');
        console.log('🔄 REGRADING SUBMISSION');
        console.log('========================================');
        console.log('Student:', result.studentName);
        console.log('GitHub URL:', result.githubUrl);
        console.log('Previous Status:', result.needsInstructorIntervention ? 'Needs Review' : 'Graded');

        const confirmRegrade = confirm(`Regrade submission for ${result.studentName}?\n\nThis will re-analyze the repository and update the grade.`);

        if (!confirmRegrade) {
            console.log('❌ Regrade cancelled by user');
            return;
        }

        this.showToast(`Starting regrade for ${result.studentName}...`, 'info');

        try {
            // Get course and assignment info
            const courseId = result.courseId;
            const assignmentId = result.assignmentId;
            const userId = result.studentId || result.userId;

            if (!courseId || !assignmentId || !userId) {
                this.showToast('Missing course/assignment info for regrade', 'error');
                return;
            }

            // Get criteria - try to use stored criteria or load from templates
            let criteria;
            if (result.criteria) {
                criteria = result.criteria;
            } else {
                // Load default or first available criteria
                const templates = await window.electronAPI.store.get('criteria.templates') || [];
                if (templates.length > 0) {
                    criteria = templates[0];
                } else {
                    criteria = this.getDefaultCriteria();
                }
            }

            // Fetch submission details for assignment context
            let assignmentContext = null;
            try {
                const submissionResult = await window.electronAPI.canvas.getSubmission(courseId, assignmentId, userId);
                if (submissionResult.success) {
                    assignmentContext = {
                        assignment_id: assignmentId,
                        user_id: userId,
                        submitted_at: submissionResult.submission.submitted_at,
                        due_at: submissionResult.submission.assignment?.due_at
                    };
                }
            } catch (error) {
                console.warn('Could not fetch submission details:', error);
            }

            // Perform regrading
            console.log('📡 Calling grader.analyzeProject for regrade...');
            const regradeResult = await window.electronAPI.grader.analyzeProject(
                result.githubUrl,
                criteria,
                assignmentContext
            );

            console.log('📥 Regrade result received:', regradeResult.success);

            if (regradeResult.success) {
                // Update the existing result
                result.grade = regradeResult.grade;
                result.analysis = regradeResult.analysis;
                result.latePenalty = regradeResult.latePenalty;
                result.needsInstructorIntervention = regradeResult.needsInstructorIntervention || false;
                result.interventionReason = regradeResult.interventionReason || null;
                result.errorType = regradeResult.errorType || null;
                result.error = null; // Clear any previous errors
                result.regradedAt = new Date().toISOString();
                result.regraded = true; // Mark as regraded to allow re-posting to Canvas

                console.log('✅ Result updated successfully');
                this.showToast(`Regrade completed for ${result.studentName}!`, 'success');

                // Auto-save updated results
                await this.saveGradingResults();

                // Refresh display
                this.loadGradingResults();
            } else {
                console.error('❌ Regrade failed:', regradeResult.error);

                // Check if it's still a private/inaccessible repo
                if (regradeResult.errorType === 'private_repo' || regradeResult.errorType === 'not_found') {
                    this.showToast(`Repository still inaccessible for ${result.studentName}`, 'warning');

                    // Update error info
                    result.error = regradeResult.error;
                    result.errorType = regradeResult.errorType;
                    result.interventionReason = regradeResult.interventionReason;
                    result.regradedAt = new Date().toISOString();

                    await this.saveGradingResults();
                    this.loadGradingResults();
                } else {
                    this.showToast(`Regrade failed: ${regradeResult.error}`, 'error');
                }
            }

            console.log('========================================\n');

        } catch (error) {
            console.error('❌ Regrade exception:', error);
            this.showToast(`Error during regrade: ${error.message}`, 'error');
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

        feedback += `\n🤖 Generated with AraLaro`;
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
};
