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

        const usageTotal = this.sumUsage(this.gradingResults.map(r => (r.grade?.result || r.grade)?.usage));
        summaryDiv.innerHTML = `
            Total: ${totalCount} | Graded: ${gradedCount} | Needs Review: ${reviewCount} |
            Showing: ${filteredResults.length} result(s)
            ${usageTotal.grades ? `<div style="margin-top: 4px; opacity: 0.8; font-size: 13px;" title="On a Claude subscription this isn't charged; plan limits count the tokens.">Claude CLI usage: ${this.formatUsage(usageTotal)}</div>` : ''}
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
                    <button class="btn btn-secondary" onclick="filterResults('review')" style="margin-left: 8px;">View Review Queue</button>
                    <button class="btn" onclick="app.regradeAllNeedingReview()" style="margin-left: 8px;">Regrade all needing review (${reviewCount})</button></p>
                </div>
            `;
        }

        if (filteredResults.length === 0) {
            html += '<p>No results match the current filter.</p>';
            resultsTable.innerHTML = html;
            return;
        }

        html += '<table class="table"><thead><tr><th>Student</th><th>Status</th><th>Grade</th><th>Repo</th><th>Actions</th></tr></thead><tbody>';

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
            const gradeData = result.grade?.result || result.grade || {};
            // Same one-decimal rounding as what gets posted (CanvasAPI.roundScore);
            // an instructor adjustment shows the AI's original next to it
            const shownValue = result.override ? this.postedScore(result) : gradeValue;
            const shown = typeof shownValue === 'number' ? Math.round(shownValue * 10) / 10 : shownValue;
            const grade = gradeValue !== 'N/A'
                ? `${shown}/${gradeData.maxPoints || 50}` +
                  (result.override ? ` <span style="font-size: 12px; opacity: 0.75; white-space: nowrap;" title="Adjusted by you">(AI: ${Math.round(gradeValue * 10) / 10})</span>` : '')
                : 'N/A';

            // Instructor-only flag from the AI-authorship check
            const suspicion = gradeData.authorship?.suspicion;
            const aiBadge = suspicion === 'medium' || suspicion === 'high'
                ? ` <span title="${(gradeData.authorship.reasons || []).join('; ').replace(/"/g, '&quot;')}" style="background: ${suspicion === 'high' ? '#c0392b' : '#e67e22'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-left: 4px; white-space: nowrap; display: inline-block;">AI? ${suspicion}</span>`
                : '';

            // A button instead of the full link, so the actions column has room;
            // the full URL is in the tooltip
            const githubUrl = result.githubUrl
                ? `<button class="btn btn-secondary" style="white-space: nowrap;" onclick="app.openResultRepo(${originalIndex})" title="${result.githubUrl.replace(/"/g, '&quot;')}">Open repo ↗</button>`
                : '<span style="opacity: 0.7;">Not provided</span>';

            html += `
                <tr style="${result.needsInstructorIntervention ? 'background: rgba(231, 76, 60, 0.1);' : ''}">
                    <td>${result.studentName || 'Unknown'}</td>
                    <td>${statusBadge}${aiBadge}</td>
                    <td>${grade}</td>
                    <td>${githubUrl}</td>
                    <td>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                            <button class="btn btn-secondary" onclick="app.viewDetailedResult(${originalIndex})">View Details</button>
                            ${result.needsInstructorIntervention ?
                                `<button class="btn" onclick="app.openCanvasSubmission(${originalIndex})">Review in Canvas</button>` :
                                result.postedToCanvas && !result.regraded ?
                                `<button class="btn" disabled style="opacity: 0.5; cursor: not-allowed;" title="Already posted to Canvas">Posted to Canvas</button>` :
                                `<button class="btn" onclick="app.postGradeToCanvas(${originalIndex})">${result.postedToCanvas ? 'Re-post' : 'Post'} to Canvas</button>`
                            }
                            ${(result.errorType === 'private_repo' || result.errorType === 'not_found') && !result.commentPosted ?
                                `<button class="btn" onclick="app.postInaccessibleComment(${originalIndex})" style="background: #f39c12;">Comment on Access Issue</button>` :
                                ''
                            }
                            <button class="btn btn-secondary" onclick="app.regradeSubmission(${originalIndex})">Regrade</button>
                        </div>
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

            // The token is never sent back to the renderer; say it's stored
            // so an empty field doesn't read as "not saved".
            const tokenInput = document.getElementById('canvas-token');
            if (tokenInput && user) {
                tokenInput.placeholder = 'Token stored securely - enter a new one only to replace it';
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
                        <strong>Issue:</strong> ${this.describeReviewReason(result)}
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
                    <div style="margin-bottom: 8px; opacity: 0.7; font-size: 14px;">${result.override ? 'Overall Grade (adjusted by you)' : 'Overall Grade'}</div>
                    <div>
                        <span class="main-grade">${this.postedScore(result)}</span>
                        <span class="max-grade">/ ${grade.maxPoints || 50}</span>
                    </div>
                    ${result.override ? `<div style="margin-top: 6px; opacity: 0.7; font-size: 13px;">AI score: ${grade.overallGrade} / ${grade.maxPoints || 50}</div>` : ''}
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

            // Comment that will be posted to Canvas, and the instructor-only
            // authorship check (never posted)
            const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
            const override = result.override;
            const maxPoints = grade.maxPoints || 50;
            detailsHtml += `
                <h3 style="margin: 24px 0 8px 0; font-size: 18px;">What will be posted to Canvas</h3>
                ${override ? `<p style="margin: 0 0 8px 0; color: #f39c12;">Adjusted by you on ${new Date(override.adjustedAt).toLocaleString()} (AI score was ${esc(override.aiScore)}/${maxPoints}).</p>` : ''}
                <pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${esc(this.buildCanvasFeedback(grade, override) || `Score ${this.postedScore(result)}/${maxPoints}, with no comment`)}</pre>

                <div style="margin-top: 16px; padding: 16px; border-radius: 8px; background: rgba(255,255,255,0.06);">
                    <h4 style="margin: 0 0 12px 0;">Adjust before posting</h4>
                    <label style="display: block; font-size: 14px; margin-bottom: 4px;">Score (0 to ${maxPoints})</label>
                    <input id="adjust-score" type="number" min="0" max="${maxPoints}" step="0.1"
                           value="${esc(this.postedScore(result) ?? '')}"
                           style="width: 120px; padding: 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: inherit;">
                    <label style="display: block; font-size: 14px; margin: 12px 0 4px 0;">Comment (leave empty to post the score only)</label>
                    <textarea id="adjust-comment" rows="3"
                              style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: inherit; resize: vertical;">${esc(override ? override.comment : this.aiCommentBody(grade))}</textarea>
                    <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
                        <button class="btn" onclick="app.saveAdjustment(${index})">Save adjustment</button>
                        ${override ? `<button class="btn btn-secondary" onclick="app.resetAdjustment(${index})">Reset to AI score and comment</button>` : ''}
                    </div>
                </div>
            `;
            if (grade.usage) {
                detailsHtml += `
                    <h3 style="margin: 24px 0 8px 0; font-size: 18px;">Grader Usage</h3>
                    <p style="margin: 0;">${esc(grade.usage.model || 'Claude CLI')}: ${esc(this.formatUsage(this.sumUsage([grade.usage])))}</p>
                    <p style="margin: 4px 0 0 0; opacity: 0.7; font-size: 13px;">On a Claude subscription this isn't charged; your plan's usage limits count the tokens.</p>
                `;
            }
            if (grade.authorship) {
                const reasons = (grade.authorship.reasons || []).map(r => `<li>${esc(r)}</li>`).join('');
                detailsHtml += `
                    <h3 style="margin: 24px 0 8px 0; font-size: 18px;">Authorship Check (instructor only)</h3>
                    <p style="margin: 0;">AI / copied-code suspicion: <strong>${esc(grade.authorship.suspicion || 'none')}</strong>. This doesn't change the score.</p>
                    ${reasons ? `<ul style="margin: 8px 0 0 20px;">${reasons}</ul>` : ''}
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
                    <p style="margin: 4px 0;"><strong>Issue:</strong> ${this.describeReviewReason(result)}</p>
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
            // The instructor's adjusted score wins over the AI's
            const grade = this.postedScore(result);
            if (grade === undefined || grade === null) {
                console.error('❌ Cannot find overallGrade in result structure');
                console.log('result.grade structure:', result.grade);
                this.showToast('Cannot extract grade from result', 'error');
                return;
            }

            console.log('Final grade to post:', grade, result.override ? '(adjusted by instructor)' : '');

            const feedback = this.buildCanvasFeedback(result.grade, result.override);
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
                const commentsOn = (await window.electronAPI.store.get('canvas.postComments')) !== false;
                this.showToast(`Grade posted to Canvas for ${result.studentName}${commentsOn ? '' : ' (score only, no comment)'}`, 'success');
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

    // Regrade every result marked "Needs Review" that has a GitHub URL, one
    // at a time (each clones a repo and runs a grade), after one confirmation.
    async regradeAllNeedingReview() {
        const indexes = this.gradingResults
            .map((r, i) => (r.needsInstructorIntervention && r.githubUrl ? i : -1))
            .filter(i => i >= 0);

        if (indexes.length === 0) {
            this.showToast('No submissions needing review have a GitHub URL to regrade', 'warning');
            return;
        }
        if (!confirm(`Regrade ${indexes.length} submission(s) that need review?\n\nEach one re-clones the repository and is graded again.`)) {
            return;
        }

        for (let n = 0; n < indexes.length; n++) {
            this.showToast(`Regrading ${n + 1} of ${indexes.length}...`, 'info');
            await this.regradeSubmission(indexes[n], { skipConfirm: true });
        }

        const stillFailing = indexes.filter(i => this.gradingResults[i].needsInstructorIntervention).length;
        const usage = this.sumUsage(indexes.map(i => (this.gradingResults[i].grade?.result || this.gradingResults[i].grade)?.usage));
        this.showToast(`Regrade finished: ${indexes.length - stillFailing} fixed, ${stillFailing} still need review` +
            (usage.grades ? `. Claude CLI usage: ${this.formatUsage(usage)}` : ''), stillFailing ? 'warning' : 'success');
    }

    async regradeSubmission(index, { skipConfirm = false } = {}) {
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

        const confirmRegrade = skipConfirm || confirm(`Regrade submission for ${result.studentName}?\n\nThis will re-analyze the repository and update the grade.`);

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

            // Fetch assignment and submission details for context (due date,
            // late penalty, Canvas rubric)
            let assignmentContext = null;
            try {
                const [assignmentsResult, submissionsResult] = await Promise.all([
                    window.electronAPI.canvas.getAssignments(courseId),
                    window.electronAPI.canvas.getSubmissions(courseId, assignmentId)
                ]);
                const assignment = assignmentsResult.success
                    ? assignmentsResult.assignments.find(a => a.id == assignmentId)
                    : null;
                const submission = submissionsResult.success
                    ? submissionsResult.submissions.find(s => s.user_id == userId)
                    : null;
                assignmentContext = {
                    assignment_id: assignmentId,
                    user_id: userId,
                    name: assignment?.name || '',
                    description: assignment?.description || '',
                    points_possible: assignment?.points_possible || null,
                    submitted_at: submission?.submitted_at || null,
                    due_at: assignment?.due_at || null,
                    rubric: assignment?.rubric || null
                };
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
                delete result.override; // An adjustment was for the old grade

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

    // Why a result needs review, from the most specific detail it has. Results
    // saved before reasons were recorded fall through to the grader's notes.
    describeReviewReason(result) {
        const grade = result.grade?.result || result.grade || {};
        const reason = result.interventionReason ||
            result.error ||
            (grade.gradingNotes ? `Grader flagged for review: ${grade.gradingNotes}` : '') ||
            (grade.rawOutput ? 'The grader reply could not be read; grade this submission manually' : '') ||
            'No reason was recorded for this flag. Regrade to get one.';
        return String(reason).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    }

    // Open a result's repository (including the linked branch) in the browser
    openResultRepo(index) {
        const url = this.gradingResults[index]?.githubUrl;
        if (url) window.electronAPI.app.openExternal(url);
    }

    // "Post comments with grades": stored so the main process can drop the
    // comment from every grade post (see canvas-post-grade).
    async loadPostCommentsSetting() {
        const toggle = document.getElementById('post-comments-toggle');
        if (toggle) toggle.checked = (await window.electronAPI.store.get('canvas.postComments')) !== false;
    }

    async setPostComments(enabled) {
        await window.electronAPI.store.set('canvas.postComments', !!enabled);
        this.showToast(enabled ? 'Comments will be posted with grades' : 'Grades will be posted without comments', 'info');
    }

    // Total the grader usage records ({ costUSD, inputTokens, ... } from the
    // Claude CLI) across a list of them; missing entries are skipped.
    sumUsage(usages) {
        const total = { grades: 0, costUSD: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, durationMs: 0 };
        for (const u of usages) {
            if (!u) continue;
            total.grades++;
            for (const key of Object.keys(total)) {
                if (key !== 'grades') total[key] += u[key] || 0;
            }
        }
        return total;
    }

    // e.g. "3 grades · 41,200 tokens · 1m 32s · ≈$0.31 at API prices"
    formatUsage(total) {
        if (!total.grades) return 'No CLI usage recorded';
        const tokens = total.inputTokens + total.outputTokens + total.cacheReadTokens + total.cacheWriteTokens;
        const secs = Math.round(total.durationMs / 1000);
        const time = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
        return `${total.grades} grade${total.grades === 1 ? '' : 's'} · ${tokens.toLocaleString()} tokens ` +
            `(${total.inputTokens.toLocaleString()} in, ${total.outputTokens.toLocaleString()} out, ` +
            `${(total.cacheReadTokens + total.cacheWriteTokens).toLocaleString()} cached) · ${time} · ` +
            `≈$${total.costUSD.toFixed(2)} at API prices`;
    }

    // The comment posted to Canvas: the score and a short note on only the
    // most significant points. The full breakdown stays in the app. The
    // authorship check is instructor-only and never goes into this.
    // An instructor override ({ score, comment }) replaces the AI's score and
    // comment body; the "Score:" line is always rebuilt from the posted score.
    buildCanvasFeedback(gradeResult, override = null) {
        const result = gradeResult.result || gradeResult;
        const maxPoints = result.maxPoints || 50;

        const comment = override && override.comment !== undefined
            ? override.comment.trim()
            : this.aiCommentBody(gradeResult);

        // The instructor cleared the comment: post the score with no comment at all
        if (override && !comment) return '';

        // Same one-decimal rounding as the posted score (CanvasAPI.roundScore)
        const raw = this.postedScore({ grade: gradeResult, override });
        const score = Number.isFinite(Number(raw)) ? Math.round(Number(raw) * 10) / 10 : raw;
        return comment
            ? `Score: ${score}/${maxPoints}\n${comment}`
            : `Score: ${score}/${maxPoints}`;
    }

    // The AI's short comment for the student, without the "Score:" line
    aiCommentBody(gradeResult) {
        const result = gradeResult.result || gradeResult;
        let comment = (result.canvasComment || '').trim();
        if (!comment) {
            comment = result.overallFeedback?.improvements?.[0] ||
                result.overallFeedback?.detailedFeedback || '';
        }
        if (comment.length > 300) {
            comment = comment.slice(0, 297).replace(/\s+\S*$/, '') + '...';
        }
        return comment;
    }

    // The score that will be posted: the instructor's override, else the AI's
    postedScore(result) {
        if (result.override && Number.isFinite(Number(result.override.score))) {
            return Number(result.override.score);
        }
        const grade = result.grade?.result || result.grade || {};
        return grade.overallGrade;
    }

    // Save the instructor's score/comment from the Details editor
    async saveAdjustment(index) {
        const result = this.gradingResults[index];
        if (!result?.grade) return;
        const grade = result.grade.result || result.grade;
        const maxPoints = grade.maxPoints || 50;

        const score = Number(document.getElementById('adjust-score')?.value);
        if (!Number.isFinite(score) || score < 0 || score > maxPoints) {
            this.showToast(`Score must be a number from 0 to ${maxPoints}`, 'warning');
            return;
        }
        const comment = document.getElementById('adjust-comment')?.value ?? '';

        result.override = {
            score: Math.round(score * 10) / 10,
            comment,
            aiScore: grade.overallGrade,
            adjustedAt: new Date().toISOString()
        };
        if (result.postedToCanvas) result.regraded = true; // allow Re-post with the new score

        await this.saveGradingResults();
        this.loadGradingResults();
        this.viewDetailedResult(index);
        this.showToast(`Adjustment saved for ${result.studentName}. Post to Canvas to send it.`, 'success');
    }

    async resetAdjustment(index) {
        const result = this.gradingResults[index];
        if (!result?.override) return;
        delete result.override;
        if (result.postedToCanvas) result.regraded = true;
        await this.saveGradingResults();
        this.loadGradingResults();
        this.viewDetailedResult(index);
        this.showToast(`Back to the AI's score and comment for ${result.studentName}`, 'info');
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
