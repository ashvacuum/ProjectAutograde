/**
 * Late Penalty Calculator
 *
 * Calculates late submission penalties based on:
 * - Due date
 * - Submission date
 * - Penalty per day (in %, increments of 5)
 * - Maximum penalty cap (in %, increments of 5)
 * - Grace period (in hours)
 */

class LatePenaltyCalculator {
  /**
   * Calculate late penalty for a submission
   *
   * @param {Object} options - Calculation options
   * @param {Date|string} options.dueDate - Assignment due date
   * @param {Date|string} options.submittedAt - Submission date
   * @param {number} options.penaltyPerDay - Penalty percentage per day (default: 10)
   * @param {number} options.maxPenalty - Maximum penalty percentage (default: 50)
   * @param {number} options.gracePeriodHours - Grace period in hours (default: 0)
   * @returns {Object} Penalty calculation result
   */
  static calculatePenalty({
    dueDate,
    submittedAt,
    penaltyPerDay = 10,
    maxPenalty = 50,
    gracePeriodHours = 0
  }) {
    // Convert to Date objects if strings
    const due = new Date(dueDate);
    const submitted = new Date(submittedAt);

    // Validate dates
    if (isNaN(due.getTime()) || isNaN(submitted.getTime())) {
      return {
        isLate: false,
        daysLate: 0,
        penaltyPercentage: 0,
        penaltyApplied: 0,
        error: 'Invalid date format'
      };
    }

    // Calculate time difference in milliseconds
    const timeDiff = submitted - due;

    // Apply grace period (convert hours to milliseconds)
    const gracePeriodMs = gracePeriodHours * 60 * 60 * 1000;
    const effectiveLateness = timeDiff - gracePeriodMs;

    // Not late if submitted before due date or within grace period
    if (effectiveLateness <= 0) {
      return {
        isLate: false,
        daysLate: 0,
        hoursLate: 0,
        penaltyPercentage: 0,
        penaltyApplied: 0,
        submittedAt: submitted,
        dueDate: due,
        gracePeriodUsed: timeDiff > 0 && timeDiff <= gracePeriodMs
      };
    }

    // Calculate days late (round up partial days)
    const hoursLate = effectiveLateness / (1000 * 60 * 60);
    const daysLate = Math.ceil(hoursLate / 24);

    // Calculate penalty percentage
    let penaltyPercentage = daysLate * penaltyPerDay;

    // Cap at maximum penalty
    if (penaltyPercentage > maxPenalty) {
      penaltyPercentage = maxPenalty;
    }

    return {
      isLate: true,
      daysLate,
      hoursLate: Math.round(hoursLate * 10) / 10, // Round to 1 decimal
      penaltyPercentage,
      penaltyApplied: penaltyPercentage,
      submittedAt: submitted,
      dueDate: due,
      gracePeriodUsed: false,
      cappedAtMax: (daysLate * penaltyPerDay) > maxPenalty
    };
  }

  /**
   * Apply late penalty to a grade
   *
   * @param {number} originalGrade - Original grade before penalty
   * @param {number} maxPoints - Maximum points possible
   * @param {Object} penaltyInfo - Result from calculatePenalty()
   * @returns {Object} Adjusted grade information
   */
  static applyPenaltyToGrade(originalGrade, maxPoints, penaltyInfo) {
    if (!penaltyInfo.isLate || penaltyInfo.penaltyPercentage === 0) {
      return {
        originalGrade,
        adjustedGrade: originalGrade,
        maxPoints,
        penaltyPoints: 0,
        penaltyPercentage: 0,
        isLate: false
      };
    }

    // Calculate penalty in points
    const penaltyPoints = (maxPoints * penaltyInfo.penaltyPercentage) / 100;

    // Calculate adjusted grade
    let adjustedGrade = originalGrade - penaltyPoints;

    // Don't go below zero
    if (adjustedGrade < 0) {
      adjustedGrade = 0;
    }

    // Round to 2 decimal places
    adjustedGrade = Math.round(adjustedGrade * 100) / 100;
    const roundedPenaltyPoints = Math.round(penaltyPoints * 100) / 100;

    return {
      originalGrade,
      adjustedGrade,
      maxPoints,
      penaltyPoints: roundedPenaltyPoints,
      penaltyPercentage: penaltyInfo.penaltyPercentage,
      daysLate: penaltyInfo.daysLate,
      hoursLate: penaltyInfo.hoursLate,
      isLate: true,
      submittedAt: penaltyInfo.submittedAt,
      dueDate: penaltyInfo.dueDate
    };
  }

  /**
   * Format late penalty information for display
   *
   * @param {Object} gradeInfo - Result from applyPenaltyToGrade()
   * @returns {string} Formatted penalty description
   */
  static formatPenaltyDescription(gradeInfo) {
    if (!gradeInfo.isLate) {
      return 'Submitted on time';
    }

    const parts = [];
    parts.push(`Submitted ${gradeInfo.daysLate} day${gradeInfo.daysLate !== 1 ? 's' : ''} late`);
    parts.push(`(${gradeInfo.hoursLate.toFixed(1)} hours)`);
    parts.push(`Penalty: ${gradeInfo.penaltyPercentage}%`);
    parts.push(`(-${gradeInfo.penaltyPoints} points)`);

    return parts.join(' " ');
  }

  /**
   * Generate a late penalty comment for Canvas
   *
   * @param {Object} gradeInfo - Result from applyPenaltyToGrade()
   * @param {Object} settings - Late penalty settings
   * @returns {string} Comment text
   */
  static generateLatePenaltyComment(gradeInfo, settings) {
    if (!gradeInfo.isLate) {
      return '';
    }

    const lines = [];
    lines.push('ð LATE SUBMISSION PENALTY APPLIED');
    lines.push('');
    lines.push(`Due Date: ${gradeInfo.dueDate.toLocaleString()}`);
    lines.push(`Submitted: ${gradeInfo.submittedAt.toLocaleString()}`);
    lines.push(`Days Late: ${gradeInfo.daysLate} (${gradeInfo.hoursLate.toFixed(1)} hours)`);
    lines.push('');
    lines.push(`Penalty Rate: ${settings.penaltyPerDay}% per day`);
    lines.push(`Maximum Penalty: ${settings.maxPenalty}%`);
    if (settings.gracePeriodHours > 0) {
      lines.push(`Grace Period: ${settings.gracePeriodHours} hours`);
    }
    lines.push('');
    lines.push(`Original Grade: ${gradeInfo.originalGrade}/${gradeInfo.maxPoints}`);
    lines.push(`Penalty Applied: -${gradeInfo.penaltyPoints} points (${gradeInfo.penaltyPercentage}%)`);
    lines.push(`Final Grade: ${gradeInfo.adjustedGrade}/${gradeInfo.maxPoints}`);

    return lines.join('\n');
  }
}

module.exports = LatePenaltyCalculator;
