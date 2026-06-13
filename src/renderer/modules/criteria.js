// Criteria / rubric builder UI.
// Applied to the app via the mixin-function pattern: (Base) => class extends Base.
// Methods here run with the same `this` as the rest of the app.
export default (Base) => class extends Base {
    // Criteria Builder Methods
    showCriteriaModal(criteriaId = null) {
        const modal = document.getElementById('criteria-modal');
        const title = document.getElementById('criteria-modal-title');

        this.currentEditingCriteriaId = criteriaId;

        if (criteriaId) {
            title.textContent = 'Edit Criteria';
            this.loadCriteriaForEditing(criteriaId);
        } else {
            title.textContent = 'Create New Criteria';
            this.resetCriteriaForm();
            // Add one default criteria item
            this.addCriteriaItem();
        }

        modal.style.display = 'flex';
    }

    closeCriteriaModal() {
        const modal = document.getElementById('criteria-modal');
        modal.style.display = 'none';
        this.resetCriteriaForm();
        this.currentEditingCriteriaId = null;
    }

    resetCriteriaForm() {
        document.getElementById('criteria-name').value = '';
        document.getElementById('criteria-description').value = '';
        document.getElementById('criteria-items-container').innerHTML = '';
        this.updateTotalPoints();
    }

    async loadCriteriaForEditing(criteriaId) {
        try {
            const templates = await window.electronAPI.store.get('criteria.templates') || [];
            const template = templates.find(t => t.id === criteriaId);

            if (template) {
                document.getElementById('criteria-name').value = template.name;
                document.getElementById('criteria-description').value = template.description || '';

                // Load items
                document.getElementById('criteria-items-container').innerHTML = '';
                template.items.forEach(item => {
                    this.addCriteriaItem(item);
                });

                this.updateTotalPoints();
            }
        } catch (error) {
            this.showToast(`Error loading criteria: ${error.message}`, 'error');
        }
    }

    addCriteriaItem(itemData = null) {
        const container = document.getElementById('criteria-items-container');
        const itemIndex = container.children.length;

        const itemDiv = document.createElement('div');
        itemDiv.className = 'criteria-item-card';
        itemDiv.dataset.itemIndex = itemIndex;

        itemDiv.innerHTML = `
            <div class="criteria-item-header">
                <div class="criteria-item-number">Item #${itemIndex + 1}</div>
                <button type="button" class="criteria-item-delete" onclick="app.removeCriteriaItem(${itemIndex})">
                    Remove
                </button>
            </div>

            <div class="form-group">
                <label class="form-label">Item Name *</label>
                <input type="text" class="form-input" name="item-name" required
                       placeholder="e.g., Code Quality" value="${itemData?.name || ''}">
            </div>

            <div class="form-group">
                <label class="form-label">Description</label>
                <input type="text" class="form-input" name="item-description"
                       placeholder="Brief description" value="${itemData?.description || ''}">
            </div>

            <div class="grid-2">
                <div class="form-group">
                    <label class="form-label">Points *</label>
                    <input type="number" class="form-input item-points" name="item-points" required min="0" step="0.1"
                           placeholder="10" value="${itemData?.points || ''}" onchange="app.updateTotalPoints()">
                </div>
                <div class="form-group">
                    <label class="form-label">Weight</label>
                    <select class="form-input" name="item-weight">
                        <option value="low" ${itemData?.weight === 'low' ? 'selected' : ''}>Low</option>
                        <option value="medium" ${itemData?.weight === 'medium' ? 'selected' : ''}>Medium</option>
                        <option value="high" ${itemData?.weight === 'high' ? 'selected' : ''}>High</option>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">Ratings (optional - for rubric levels)</label>
                <div class="ratings-container" data-item-index="${itemIndex}">
                    ${itemData?.ratings ? itemData.ratings.map((rating, idx) => this.createRatingHTML(itemIndex, idx, rating)).join('') : ''}
                </div>
                <button type="button" class="btn btn-secondary" onclick="app.addRating(${itemIndex})" style="margin-top: 8px; padding: 8px 16px; font-size: 13px;">
                    + Add Rating Level
                </button>
            </div>
        `;

        container.appendChild(itemDiv);
        this.updateItemNumbers();
        this.updateTotalPoints();
    }

    createRatingHTML(itemIndex, ratingIndex, ratingData = null) {
        return `
            <div class="rating-item" data-rating-index="${ratingIndex}">
                <input type="text" class="form-input" placeholder="Rating name" value="${ratingData?.name || ''}" style="font-size: 13px; padding: 8px;">
                <input type="number" class="form-input" placeholder="Points" value="${ratingData?.points || ''}" min="0" step="0.1" style="font-size: 13px; padding: 8px;">
                <input type="text" class="form-input" placeholder="Description" value="${ratingData?.description || ''}" style="font-size: 13px; padding: 8px;">
                <button type="button" class="rating-delete-btn" onclick="app.removeRating(${itemIndex}, ${ratingIndex})">×</button>
            </div>
        `;
    }

    addRating(itemIndex) {
        const container = document.querySelector(`.ratings-container[data-item-index="${itemIndex}"]`);
        const ratingIndex = container.querySelectorAll('.rating-item').length;

        const ratingDiv = document.createElement('div');
        ratingDiv.innerHTML = this.createRatingHTML(itemIndex, ratingIndex);
        container.appendChild(ratingDiv.firstElementChild);
    }

    removeRating(itemIndex, ratingIndex) {
        const container = document.querySelector(`.ratings-container[data-item-index="${itemIndex}"]`);
        const ratings = container.querySelectorAll('.rating-item');
        if (ratings[ratingIndex]) {
            ratings[ratingIndex].remove();
        }
    }

    removeCriteriaItem(itemIndex) {
        const container = document.getElementById('criteria-items-container');
        const items = container.querySelectorAll('.criteria-item-card');
        if (items[itemIndex]) {
            items[itemIndex].remove();
            this.updateItemNumbers();
            this.updateTotalPoints();
        }
    }

    updateItemNumbers() {
        const container = document.getElementById('criteria-items-container');
        const items = container.querySelectorAll('.criteria-item-card');
        items.forEach((item, index) => {
            item.dataset.itemIndex = index;
            const numberEl = item.querySelector('.criteria-item-number');
            if (numberEl) {
                numberEl.textContent = `Item #${index + 1}`;
            }
        });
    }

    updateTotalPoints() {
        const pointsInputs = document.querySelectorAll('.item-points');
        let total = 0;
        pointsInputs.forEach(input => {
            const value = parseFloat(input.value) || 0;
            total += value;
        });
        document.getElementById('criteria-total-points').textContent = total.toFixed(1);
    }

    async saveCriteriaTemplate() {
        try {
            const name = document.getElementById('criteria-name').value.trim();
            const description = document.getElementById('criteria-description').value.trim();
            const customInstructions = document.getElementById('custom-ai-instructions').value.trim();

            if (!name) {
                this.showToast('Please enter a rubric name', 'warning');
                return;
            }

            // Collect all criteria items
            const container = document.getElementById('criteria-items-container');
            const items = [];

            container.querySelectorAll('.criteria-item-card').forEach((itemCard, idx) => {
                const itemName = itemCard.querySelector('[name="item-name"]').value.trim();
                const itemDesc = itemCard.querySelector('[name="item-description"]').value.trim();
                const itemPoints = parseFloat(itemCard.querySelector('[name="item-points"]').value) || 0;
                const itemWeight = itemCard.querySelector('[name="item-weight"]').value;

                if (!itemName || itemPoints === 0) {
                    return; // Skip invalid items
                }

                // Collect ratings for this item
                const ratings = [];
                const ratingsContainer = itemCard.querySelector('.ratings-container');
                if (ratingsContainer) {
                    ratingsContainer.querySelectorAll('.rating-item').forEach(ratingEl => {
                        const inputs = ratingEl.querySelectorAll('input');
                        const ratingName = inputs[0]?.value.trim();
                        const ratingPoints = parseFloat(inputs[1]?.value) || 0;
                        const ratingDesc = inputs[2]?.value.trim();

                        if (ratingName) {
                            ratings.push({
                                name: ratingName,
                                points: ratingPoints,
                                description: ratingDesc
                            });
                        }
                    });
                }

                items.push({
                    id: `item-${Date.now()}-${idx}`,
                    name: itemName,
                    description: itemDesc,
                    points: itemPoints,
                    weight: itemWeight,
                    ratings: ratings.length > 0 ? ratings : undefined
                });
            });

            if (items.length === 0) {
                this.showToast('Please add at least one criteria item', 'warning');
                return;
            }

            const totalPoints = items.reduce((sum, item) => sum + item.points, 0);

            const template = {
                id: this.currentEditingCriteriaId || `criteria-${Date.now()}`,
                name,
                description,
                customInstructions: customInstructions || undefined,
                totalPoints,
                items,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Save to store
            let templates = await window.electronAPI.store.get('criteria.templates') || [];

            if (this.currentEditingCriteriaId) {
                // Update existing
                const index = templates.findIndex(t => t.id === this.currentEditingCriteriaId);
                if (index >= 0) {
                    templates[index] = template;
                } else {
                    templates.push(template);
                }
            } else {
                // Add new
                templates.push(template);
            }

            await window.electronAPI.store.set('criteria.templates', templates);

            this.showToast(`Criteria "${name}" saved successfully!`, 'success');
            this.closeCriteriaModal();
            this.loadSavedCriteria();

        } catch (error) {
            this.showToast(`Error saving criteria: ${error.message}`, 'error');
        }
    }
};
