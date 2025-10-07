# AraLaro - TODO List

## System Requirements Note

**Git Installation Required:**
AraLaro requires Git to be installed and accessible from the command line. The application uses Git to:
- Clone student repositories from GitHub
- Analyze repository history and commits
- Validate Unity project structure

If Git is not installed, grading will fail. Consider adding:
- Git installation check on first run
- Clear error message if Git is missing
- Installation instructions in docs

---

## High Priority Features

### Manual Grading Flag for Rubric Items
**Description:** Add a "Requires Manual Grading" checkbox for each criterion in the rubric builder.

**Use Case:**
Some criteria may require human judgment that AI cannot evaluate (e.g., creativity, originality, presentation quality, peer collaboration). Instructors should be able to mark specific criteria as "manual grading required" so the AI will skip them and leave them for instructor review.

**Implementation Details:**
- Add checkbox to each criteria item in the rubric modal
- Store `requiresManualGrading: boolean` field in criteria item data structure
- When AI grades, skip criteria marked as requiring manual grading
- In results, show these criteria as "Pending Manual Review"
- Instructor can manually fill in scores for these criteria in Canvas or in a manual grading interface
- Total score should account for both AI-graded and manually-graded portions

**Example Rubric:**
```
✅ Code Quality (15 pts) - AI Graded
✅ Algorithm Completion (20 pts) - AI Graded
☑️ Code Creativity (10 pts) - Manual Grading Required
☑️ Presentation Quality (5 pts) - Manual Grading Required
Total: 50 pts (35 AI + 15 Manual)
```

**Benefits:**
- Allows hybrid grading approach
- AI handles technical/objective criteria
- Instructor handles subjective criteria
- More flexible rubric system
- Better educational outcomes

---

## Future Enhancements

### Batch Regrade All
- Add button to regrade all submissions at once
- Useful after fixing grading issues or updating criteria

### Custom Scoring Scales
- Allow rubrics with different total points (not just 50)
- Percentage-based grading option

### Export to Multiple Formats
- Export results to Excel, PDF, Google Sheets
- Include detailed feedback and analytics

### Grading Analytics Dashboard
- Show class statistics (average, median, distribution)
- Identify common issues across submissions
- Track improvement over time

### Student Feedback Portal
- Allow students to view detailed AI feedback
- Compare their work against rubric criteria
- See improvement suggestions

---

*Last Updated: 2025-10-07*
