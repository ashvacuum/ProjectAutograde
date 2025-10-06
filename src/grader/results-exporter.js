const fs = require('fs').promises;
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');
const { jsPDF } = require('jspdf');

class ResultsExporter {
  constructor() {
    this.exportDir = path.join(__dirname, '../../exports');
  }

  async ensureExportDir() {
    try {
      await fs.mkdir(this.exportDir, { recursive: true });
    } catch (error) {
      console.error('Error creating export directory:', error);
    }
  }

  async exportToCsv(results, filename) {
    await this.ensureExportDir();

    const csvPath = path.join(this.exportDir, `${filename}.csv`);

    const csvData = results.map(result => ({
      student_name: result.studentName || 'Unknown',
      github_url: result.githubUrl || '',
      overall_grade: result.overallGrade || 0,
      max_points: result.maxPoints || 100,
      percentage: result.percentage || Math.round((result.overallGrade / result.maxPoints) * 100),
      strengths: (result.strengths || []).join('; '),
      improvements: (result.improvements || []).join('; '),
      detailed_feedback: result.detailedFeedback || '',
      vector_math: this.getCriterionScore(result, 'vector-math'),
      quaternions: this.getCriterionScore(result, 'quaternion-rotations'),
      transforms: this.getCriterionScore(result, 'transform-math'),
      physics: this.getCriterionScore(result, 'physics-integration'),
      trigonometry: this.getCriterionScore(result, 'trigonometry'),
      interpolation: this.getCriterionScore(result, 'interpolation-smoothing'),
      code_quality: this.getCriterionScore(result, 'code-organization'),
      performance: this.getCriterionScore(result, 'performance-optimization'),
      graded_at: result.gradedAt || new Date().toISOString(),
      analysis_time_ms: result.analysisTimeMs || 0
    }));

    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: [
        { id: 'student_name', title: 'Student Name' },
        { id: 'github_url', title: 'GitHub URL' },
        { id: 'overall_grade', title: 'Overall Grade' },
        { id: 'max_points', title: 'Max Points' },
        { id: 'percentage', title: 'Percentage' },
        { id: 'vector_math', title: 'Vector Math Score' },
        { id: 'quaternions', title: 'Quaternions Score' },
        { id: 'transforms', title: 'Transforms Score' },
        { id: 'physics', title: 'Physics Score' },
        { id: 'trigonometry', title: 'Trigonometry Score' },
        { id: 'interpolation', title: 'Interpolation Score' },
        { id: 'code_quality', title: 'Code Quality Score' },
        { id: 'performance', title: 'Performance Score' },
        { id: 'strengths', title: 'Strengths' },
        { id: 'improvements', title: 'Areas for Improvement' },
        { id: 'detailed_feedback', title: 'Detailed Feedback' },
        { id: 'graded_at', title: 'Graded At' },
        { id: 'analysis_time_ms', title: 'Analysis Time (ms)' }
      ]
    });

    await csvWriter.writeRecords(csvData);
    return csvPath;
  }

  async exportToJson(results, filename) {
    await this.ensureExportDir();

    const jsonPath = path.join(this.exportDir, `${filename}.json`);

    const exportData = {
      exportedAt: new Date().toISOString(),
      totalSubmissions: results.length,
      statistics: this.calculateStatistics(results),
      results: results.map(result => ({
        ...result,
        exportNotes: {
          analysisCompleted: !!result.overallGrade,
          hasDetailedFeedback: !!(result.detailedFeedback && result.detailedFeedback.length > 0),
          criteriaCount: result.criteriaScores ? Object.keys(result.criteriaScores).length : 0
        }
      }))
    };

    await fs.writeFile(jsonPath, JSON.stringify(exportData, null, 2), 'utf-8');
    return jsonPath;
  }

  async exportToPdf(results, filename) {
    await this.ensureExportDir();

    const pdfPath = path.join(this.exportDir, `${filename}.pdf`);

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    let yPosition = margin;

    // Title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('AraLaro Results Report', margin, yPosition);
    yPosition += 15;

    // Summary Statistics
    const stats = this.calculateStatistics(results);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');

    doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, yPosition);
    yPosition += 10;
    doc.text(`Total Submissions: ${results.length}`, margin, yPosition);
    yPosition += 10;
    doc.text(`Average Grade: ${stats.averageGrade.toFixed(1)}%`, margin, yPosition);
    yPosition += 10;
    doc.text(`Highest Grade: ${stats.highestGrade.toFixed(1)}%`, margin, yPosition);
    yPosition += 10;
    doc.text(`Lowest Grade: ${stats.lowestGrade.toFixed(1)}%`, margin, yPosition);
    yPosition += 20;

    // Grade Distribution
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Grade Distribution', margin, yPosition);
    yPosition += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Excellent (90-100%): ${stats.gradeDistribution.excellent}`, margin, yPosition);
    yPosition += 8;
    doc.text(`Good (80-89%): ${stats.gradeDistribution.good}`, margin, yPosition);
    yPosition += 8;
    doc.text(`Satisfactory (70-79%): ${stats.gradeDistribution.satisfactory}`, margin, yPosition);
    yPosition += 8;
    doc.text(`Needs Improvement (60-69%): ${stats.gradeDistribution.needsImprovement}`, margin, yPosition);
    yPosition += 8;
    doc.text(`Failing (Below 60%): ${stats.gradeDistribution.failing}`, margin, yPosition);
    yPosition += 20;

    // Individual Results
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Individual Results', margin, yPosition);
    yPosition += 15;

    for (const result of results) {
      // Check if we need a new page
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = margin;
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      const studentName = result.studentName || 'Unknown Student';
      doc.text(studentName, margin, yPosition);
      yPosition += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      const grade = result.overallGrade || 0;
      const maxPoints = result.maxPoints || 100;
      const percentage = Math.round((grade / maxPoints) * 100);

      doc.text(`Grade: ${grade}/${maxPoints} (${percentage}%)`, margin, yPosition);
      yPosition += 8;

      if (result.githubUrl) {
        doc.text(`Repository: ${result.githubUrl}`, margin, yPosition);
        yPosition += 8;
      }

      // Criteria breakdown
      if (result.criteriaScores) {
        doc.text('Criteria Scores:', margin, yPosition);
        yPosition += 8;

        for (const [criterionId, criterionResult] of Object.entries(result.criteriaScores)) {
          const score = criterionResult.score || 0;
          const maxScore = criterionResult.maxScore || 0;
          doc.text(`  • ${criterionId}: ${score}/${maxScore}`, margin + 10, yPosition);
          yPosition += 6;
        }
      }

      // Strengths
      if (result.strengths && result.strengths.length > 0) {
        yPosition += 5;
        doc.setFont('helvetica', 'bold');
        doc.text('Strengths:', margin, yPosition);
        yPosition += 6;
        doc.setFont('helvetica', 'normal');

        result.strengths.forEach(strength => {
          const wrappedText = doc.splitTextToSize(`• ${strength}`, pageWidth - margin * 2 - 10);
          doc.text(wrappedText, margin + 10, yPosition);
          yPosition += wrappedText.length * 6;
        });
      }

      // Areas for improvement
      if (result.improvements && result.improvements.length > 0) {
        yPosition += 5;
        doc.setFont('helvetica', 'bold');
        doc.text('Areas for Improvement:', margin, yPosition);
        yPosition += 6;
        doc.setFont('helvetica', 'normal');

        result.improvements.forEach(improvement => {
          const wrappedText = doc.splitTextToSize(`• ${improvement}`, pageWidth - margin * 2 - 10);
          doc.text(wrappedText, margin + 10, yPosition);
          yPosition += wrappedText.length * 6;
        });
      }

      yPosition += 15; // Space between students
    }

    await doc.save(pdfPath);
    return pdfPath;
  }

  getCriterionScore(result, criterionId) {
    if (!result.criteriaScores || !result.criteriaScores[criterionId]) {
      return 0;
    }
    return result.criteriaScores[criterionId].score || 0;
  }

  calculateStatistics(results) {
    if (results.length === 0) {
      return {
        averageGrade: 0,
        highestGrade: 0,
        lowestGrade: 0,
        gradeDistribution: {
          excellent: 0,
          good: 0,
          satisfactory: 0,
          needsImprovement: 0,
          failing: 0
        }
      };
    }

    const percentages = results.map(result => {
      const grade = result.overallGrade || 0;
      const maxPoints = result.maxPoints || 100;
      return (grade / maxPoints) * 100;
    });

    const averageGrade = percentages.reduce((sum, p) => sum + p, 0) / percentages.length;
    const highestGrade = Math.max(...percentages);
    const lowestGrade = Math.min(...percentages);

    const gradeDistribution = {
      excellent: percentages.filter(p => p >= 90).length,
      good: percentages.filter(p => p >= 80 && p < 90).length,
      satisfactory: percentages.filter(p => p >= 70 && p < 80).length,
      needsImprovement: percentages.filter(p => p >= 60 && p < 70).length,
      failing: percentages.filter(p => p < 60).length
    };

    return {
      averageGrade,
      highestGrade,
      lowestGrade,
      gradeDistribution
    };
  }

  async exportGradingSummary(results, criteria, filename) {
    await this.ensureExportDir();

    const summaryPath = path.join(this.exportDir, `${filename}_summary.json`);

    const stats = this.calculateStatistics(results);
    const criteriaAnalysis = this.analyzeCriteriaPerformance(results, criteria);

    const summary = {
      exportedAt: new Date().toISOString(),
      assignmentInfo: {
        totalSubmissions: results.length,
        criteriaUsed: criteria?.name || 'Unknown',
        maxPossiblePoints: criteria?.items?.reduce((sum, item) => sum + item.points, 0) || 100
      },
      statistics: stats,
      criteriaPerformance: criteriaAnalysis,
      recommendations: this.generateRecommendations(stats, criteriaAnalysis),
      commonIssues: this.identifyCommonIssues(results)
    };

    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
    return summaryPath;
  }

  analyzeCriteriaPerformance(results, criteria) {
    if (!criteria || !criteria.items) {
      return {};
    }

    const analysis = {};

    criteria.items.forEach(criterion => {
      const scores = results.map(result =>
        this.getCriterionScore(result, criterion.id) || 0
      );

      if (scores.length > 0) {
        analysis[criterion.id] = {
          name: criterion.name,
          maxPoints: criterion.points,
          averageScore: scores.reduce((sum, s) => sum + s, 0) / scores.length,
          highestScore: Math.max(...scores),
          lowestScore: Math.min(...scores),
          passRate: scores.filter(s => s >= criterion.points * 0.7).length / scores.length,
          distribution: {
            excellent: scores.filter(s => s >= criterion.points * 0.9).length,
            good: scores.filter(s => s >= criterion.points * 0.7 && s < criterion.points * 0.9).length,
            needsWork: scores.filter(s => s < criterion.points * 0.7).length
          }
        };
      }
    });

    return analysis;
  }

  generateRecommendations(stats, criteriaAnalysis) {
    const recommendations = [];

    // Overall performance recommendations
    if (stats.averageGrade < 70) {
      recommendations.push('Consider reviewing fundamental concepts with the class as the overall average is below 70%.');
    }

    if (stats.gradeDistribution.failing > stats.gradeDistribution.excellent) {
      recommendations.push('A significant number of students are struggling. Consider additional support or review sessions.');
    }

    // Criteria-specific recommendations
    for (const [criterionId, analysis] of Object.entries(criteriaAnalysis)) {
      if (analysis.passRate < 0.6) {
        recommendations.push(`${analysis.name}: Only ${Math.round(analysis.passRate * 100)}% of students passed this criterion. Consider additional instruction on this topic.`);
      }
    }

    return recommendations;
  }

  identifyCommonIssues(results) {
    const issues = [];
    let noGithubUrl = 0;
    let lowCodeQuality = 0;
    let missingVectorMath = 0;

    results.forEach(result => {
      if (!result.githubUrl) noGithubUrl++;

      if (this.getCriterionScore(result, 'code-organization') < 10) lowCodeQuality++;
      if (this.getCriterionScore(result, 'vector-math') < 15) missingVectorMath++;
    });

    if (noGithubUrl > 0) {
      issues.push(`${noGithubUrl} submissions missing GitHub URLs`);
    }
    if (lowCodeQuality > results.length * 0.5) {
      issues.push('Code organization is a common issue across submissions');
    }
    if (missingVectorMath > results.length * 0.4) {
      issues.push('Vector mathematics implementation needs improvement in many submissions');
    }

    return issues;
  }

  async getExportDirectory() {
    await this.ensureExportDir();
    return this.exportDir;
  }
}

module.exports = ResultsExporter;