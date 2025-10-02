# Late Submission Penalty Feature

## Overview

The autograder now supports automatic late submission penalties based on configurable rules.

## Configuration

### In Grading Criteria JSON

Each criteria template now supports a `lateSubmissionPenalty` configuration:

```json
{
  "name": "Unity Math Fundamentals",
  "description": "...",
  "lateSubmissionPenalty": {
    "enabled": true,
    "penaltyPerDay": 10,
    "maxPenalty": 50,
    "gracePeriodHours": 2
  },
  "items": [...]
}
```

### Configuration Options

- **`enabled`** (boolean): Turn penalty on/off
- **`penaltyPerDay`** (number): Percentage to deduct per day late (default: 10)
- **`maxPenalty`** (number): Maximum penalty percentage (default: 50)
- **gracePeriodHours** (number): Grace period before penalties start (default: 0)

## How It Works

### Calculation Logic

1. **Check if late**: Compare submission date to due date
2. **Apply grace period**: Subtract grace period hours from late time
3. **Calculate days late**: Round up to next full day
4. **Calculate penalty**: `daysLate × penaltyPerDay`
5. **Cap at maximum**: Apply `maxPenalty` limit
6. **Deduct from grade**: `finalGrade = originalGrade × (1 - penalty/100)`

### Example Scenarios

#### Example 1: Standard Late Submission
```javascript
Due Date: 2025-01-01 23:59:59
Submitted: 2025-01-03 10:00:00
Config: { penaltyPerDay: 10, maxPenalty: 50, gracePeriodHours: 0 }

Days Late: 2 days (rounded up)
Penalty: 2 × 10% = 20%
Original Grade: 45/50
Penalty Points: 45 × 0.20 = 9 points
Final Grade: 45 - 9 = 36/50
```

#### Example 2: With Grace Period
```javascript
Due Date: 2025-01-01 23:59:59
Submitted: 2025-01-02 01:30:00 (1.5 hours late)
Config: { penaltyPerDay: 10, maxPenalty: 50, gracePeriodHours: 2 }

Hours Late: 1.5 hours
Within Grace Period: YES
Penalty: 0%
Final Grade: 45/50 (no deduction)
```

#### Example 3: Maximum Penalty Cap
```javascript
Due Date: 2025-01-01 23:59:59
Submitted: 2025-01-15 10:00:00
Config: { penaltyPerDay: 10, maxPenalty: 50, gracePeriodHours: 0 }

Days Late: 14 days
Calculated Penalty: 14 × 10% = 140%
Capped at: 50% (maxPenalty)
Original Grade: 48/50
Penalty Points: 48 × 0.50 = 24 points
Final Grade: 48 - 24 = 24/50
```

## Usage

### Method 1: In Criteria Templates

Edit your criteria template file (`src/criteria/default-criteria.json` or custom templates):

```json
{
  "templates": [
    {
      "name": "Your Rubric Name",
      "lateSubmissionPenalty": {
        "enabled": true,
        "penaltyPerDay": 15,
        "maxPenalty": 60,
        "gracePeriodHours": 1
      },
      "items": [...]
    }
  ]
}
```

### Method 2: Programmatically

```javascript
const { calculateLatePenalty, applyLatePenalty } = require('./src/utils/late-penalty-calculator');

// Calculate penalty info
const penaltyInfo = calculateLatePenalty(
    assignment.due_at,
    submission.submitted_at,
    {
        enabled: true,
        penaltyPerDay: 10,
        maxPenalty: 50,
        gracePeriodHours: 2
    }
);

// Apply to grade
const result = applyLatePenalty(
    originalGrade,  // e.g., 45
    maxPoints,      // e.g., 50
    penaltyInfo
);

console.log(result);
// {
//   originalGrade: 45,
//   penaltyPercentage: 20,
//   penaltyApplied: 9,
//   finalGrade: 36,
//   maxPoints: 50,
//   daysLate: 2,
//   message: "Late submission: 2 day(s) late, -20% (9.0 pts)"
// }
```

## Integration with Grading Flow

The late penalty is automatically calculated and applied during batch grading if:

1. Assignment has a `due_at` date
2. Submission has a `submitted_at` date
3. Criteria has `lateSubmissionPenalty.enabled = true`

The grading result will include:

```javascript
{
  grade: {
    overallGrade: 36,          // After penalty
    originalGrade: 45,         // Before penalty
    maxPoints: 50,
    latePenalty: {
      applied: true,
      daysLate: 2,
      penaltyPercentage: 20,
      penaltyPoints: 9,
      message: "Late submission: 2 day(s) late, -20% (9.0 pts)"
    },
    // ... other grading details
  }
}
```

## Display in Results

Results panel will show:

```
Student: John Doe
Grade: 36/50 ⚠️ LATE
Original Grade: 45/50
Late Penalty: -9 pts (-20%)
Reason: 2 days late
```

## Common Configurations

### Lenient (For Homework)
```json
{
  "enabled": true,
  "penaltyPerDay": 5,
  "maxPenalty": 25,
  "gracePeriodHours": 24
}
```
- 5% per day
- Max 25% penalty
- 24-hour grace period

### Standard (For Projects)
```json
{
  "enabled": true,
  "penaltyPerDay": 10,
  "maxPenalty": 50,
  "gracePeriodHours": 2
}
```
- 10% per day
- Max 50% penalty
- 2-hour grace period

### Strict (For Exams/Quizzes)
```json
{
  "enabled": true,
  "penaltyPerDay": 25,
  "maxPenalty": 100,
  "gracePeriodHours": 0
}
```
- 25% per day
- Max 100% penalty (zero after 4 days)
- No grace period

### Disabled (No Penalties)
```json
{
  "enabled": false,
  "penaltyPerDay": 0,
  "maxPenalty": 0,
  "gracePeriodHours": 0
}
```

## Testing

Test the calculator:

```javascript
const { calculateLatePenalty } = require('./src/utils/late-penalty-calculator');

// Test case 1: On time
console.log(calculateLatePenalty(
    '2025-01-01T23:59:59',
    '2025-01-01T22:00:00',
    { enabled: true, penaltyPerDay: 10, maxPenalty: 50, gracePeriodHours: 0 }
));
// Result: { isLate: false, penaltyPercentage: 0 }

// Test case 2: 2 days late
console.log(calculateLatePenalty(
    '2025-01-01T23:59:59',
    '2025-01-03T10:00:00',
    { enabled: true, penaltyPerDay: 10, maxPenalty: 50, gracePeriodHours: 0 }
));
// Result: { isLate: true, daysLate: 2, penaltyPercentage: 20 }

// Test case 3: Grace period
console.log(calculateLatePenalty(
    '2025-01-01T23:59:59',
    '2025-01-02T01:30:00',
    { enabled: true, penaltyPerDay: 10, maxPenalty: 50, gracePeriodHours: 2 }
));
// Result: { isLate: true, daysLate: 0, penaltyPercentage: 0, message: "within grace period" }
```

## Future Enhancements

Potential improvements:

1. **UI Controls**: Add late penalty config to Criteria panel
2. **Override Option**: Allow instructors to waive penalties manually
3. **Custom Curves**: Non-linear penalty curves (e.g., logarithmic)
4. **Weekends/Holidays**: Skip weekends in day calculation
5. **Email Notifications**: Auto-notify students of late penalties
6. **Analytics**: Track late submission patterns per student/assignment

## Files Modified

- `src/criteria/default-criteria.json` - Added `lateSubmissionPenalty` to all templates
- `src/utils/late-penalty-calculator.js` - New utility for penalty calculation
- `LATE-PENALTY-FEATURE.md` - This documentation

## Notes

- Penalties are calculated at grading time, not submission time
- Regrading a late submission will recalculate the penalty
- Grace period is useful for timezone differences and technical issues
- Maximum penalty prevents excessive deductions for very late work
- Original grades are preserved for instructor review

---

**Version**: 1.0.0
**Added**: 2025-01-01
**Status**: Backend Complete, UI Pending
