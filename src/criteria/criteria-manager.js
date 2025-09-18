const Store = require('electron-store');

class CriteriaManager {
  constructor() {
    this.store = new Store();
    this.templates = this.loadTemplates();
  }

  loadTemplates() {
    return this.store.get('criteria.templates', []);
  }

  saveTemplates() {
    this.store.set('criteria.templates', this.templates);
  }

  createTemplate(name, description, items) {
    const template = {
      id: this.generateId(),
      name: name,
      description: description,
      items: items,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString()
    };

    this.templates.push(template);
    this.saveTemplates();
    return template;
  }

  updateTemplate(id, updates) {
    const index = this.templates.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error('Template not found');
    }

    this.templates[index] = {
      ...this.templates[index],
      ...updates,
      lastModified: new Date().toISOString()
    };

    this.saveTemplates();
    return this.templates[index];
  }

  deleteTemplate(id) {
    const index = this.templates.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error('Template not found');
    }

    const deleted = this.templates.splice(index, 1)[0];
    this.saveTemplates();
    return deleted;
  }

  getTemplate(id) {
    return this.templates.find(t => t.id === id);
  }

  getAllTemplates() {
    return this.templates;
  }

  getDefaultUnityMathCriteria() {
    return {
      name: 'Unity Math Fundamentals',
      description: 'Comprehensive criteria for Unity math programming assignments',
      items: [
        {
          id: 'vector-math',
          name: 'Vector Mathematics',
          description: 'Proper implementation and usage of Vector3/Vector2 operations including dot product, cross product, normalization, and magnitude calculations',
          points: 25,
          weight: 'high',
          keywords: ['Vector3', 'Vector2', 'Dot', 'Cross', 'Normalize', 'Magnitude', 'Distance'],
          examples: ['Vector3.Dot()', 'Vector3.Cross()', 'vector.normalized', 'Vector3.Distance()']
        },
        {
          id: 'quaternion-rotations',
          name: 'Quaternion Rotations',
          description: 'Understanding and implementation of quaternion-based rotations, including LookRotation, FromToRotation, and smooth rotation interpolation',
          points: 20,
          weight: 'high',
          keywords: ['Quaternion', 'LookRotation', 'FromToRotation', 'AngleAxis', 'Slerp'],
          examples: ['Quaternion.LookRotation()', 'Quaternion.FromToRotation()', 'Quaternion.Slerp()']
        },
        {
          id: 'transform-operations',
          name: 'Transform Mathematics',
          description: 'Manipulation of object transforms including position, rotation, scale, and local vs world space understanding',
          points: 20,
          weight: 'high',
          keywords: ['transform.position', 'transform.rotation', 'transform.scale', 'Translate', 'Rotate'],
          examples: ['transform.Translate()', 'transform.Rotate()', 'transform.LookAt()']
        },
        {
          id: 'physics-calculations',
          name: 'Physics Integration',
          description: 'Implementation of physics calculations including forces, velocities, collision detection, and physics-based movement',
          points: 15,
          weight: 'medium',
          keywords: ['Rigidbody', 'AddForce', 'velocity', 'Physics.Raycast', 'OnCollision'],
          examples: ['rigidbody.AddForce()', 'Physics.Raycast()', 'OnCollisionEnter()']
        },
        {
          id: 'trigonometry',
          name: 'Trigonometry Applications',
          description: 'Use of trigonometric functions for game mechanics such as circular motion, wave patterns, and angle calculations',
          points: 10,
          weight: 'medium',
          keywords: ['Mathf.Sin', 'Mathf.Cos', 'Mathf.Tan', 'Mathf.PI', 'Mathf.Atan2'],
          examples: ['Mathf.Sin(Time.time)', 'Mathf.Cos(angle)', 'Mathf.Atan2(y, x)']
        },
        {
          id: 'interpolation',
          name: 'Interpolation & Smoothing',
          description: 'Implementation of smooth transitions using Lerp, Slerp, and other interpolation methods for animation and movement',
          points: 10,
          weight: 'low',
          keywords: ['Mathf.Lerp', 'Vector3.Lerp', 'Quaternion.Slerp', 'SmoothStep'],
          examples: ['Mathf.Lerp(a, b, t)', 'Vector3.Slerp()', 'Mathf.SmoothStep()']
        }
      ]
    };
  }

  getDefaultCodeQualityCriteria() {
    return {
      name: 'Unity Code Quality Standards',
      description: 'Code organization, performance, and best practices for Unity C# development',
      items: [
        {
          id: 'code-organization',
          name: 'Code Organization',
          description: 'Proper class structure, method organization, and separation of concerns following Unity best practices',
          points: 20,
          weight: 'high',
          keywords: ['MonoBehaviour', 'class', 'public', 'private', 'SerializeField'],
          examples: ['[SerializeField] private', 'public class PlayerController : MonoBehaviour']
        },
        {
          id: 'performance',
          name: 'Performance Optimization',
          description: 'Efficient code in Update loops, proper use of caching, and avoiding expensive operations in frequent calls',
          points: 15,
          weight: 'medium',
          keywords: ['Update', 'FixedUpdate', 'cache', 'GetComponent', 'FindObjectOfType'],
          examples: ['Cache GetComponent calls', 'Avoid FindObjectOfType in Update']
        },
        {
          id: 'naming-conventions',
          name: 'Naming Conventions',
          description: 'Consistent and descriptive variable, method, and class naming following C# conventions',
          points: 10,
          weight: 'low',
          keywords: ['camelCase', 'PascalCase', 'descriptive names'],
          examples: ['playerSpeed', 'CalculateDistance()', 'PlayerController']
        },
        {
          id: 'error-handling',
          name: 'Error Handling',
          description: 'Proper null checking, bounds checking, and defensive programming practices',
          points: 10,
          weight: 'medium',
          keywords: ['null check', 'try-catch', 'bounds check', '!= null'],
          examples: ['if (target != null)', 'try-catch blocks', 'Array bounds checking']
        },
        {
          id: 'documentation',
          name: 'Code Documentation',
          description: 'Clear comments, meaningful variable names, and documentation of complex math formulas',
          points: 5,
          weight: 'low',
          keywords: ['comments', '///', 'XML documentation', 'summary'],
          examples: ['/// <summary>', '// Calculate velocity using physics formula', 'Clear variable names']
        }
      ]
    };
  }

  initializeDefaultTemplates() {
    if (this.templates.length === 0) {
      this.createTemplate(
        this.getDefaultUnityMathCriteria().name,
        this.getDefaultUnityMathCriteria().description,
        this.getDefaultUnityMathCriteria().items
      );

      this.createTemplate(
        this.getDefaultCodeQualityCriteria().name,
        this.getDefaultCodeQualityCriteria().description,
        this.getDefaultCodeQualityCriteria().items
      );
    }
  }

  validateCriteria(criteria) {
    const errors = [];

    if (!criteria.name || criteria.name.trim().length === 0) {
      errors.push('Criteria name is required');
    }

    if (!criteria.items || !Array.isArray(criteria.items) || criteria.items.length === 0) {
      errors.push('At least one criteria item is required');
    }

    if (criteria.items) {
      criteria.items.forEach((item, index) => {
        if (!item.name || item.name.trim().length === 0) {
          errors.push(`Item ${index + 1}: Name is required`);
        }

        if (!item.description || item.description.trim().length === 0) {
          errors.push(`Item ${index + 1}: Description is required`);
        }

        if (!item.points || item.points <= 0) {
          errors.push(`Item ${index + 1}: Points must be greater than 0`);
        }

        if (!item.weight || !['low', 'medium', 'high'].includes(item.weight)) {
          errors.push(`Item ${index + 1}: Weight must be 'low', 'medium', or 'high'`);
        }
      });
    }

    return errors;
  }

  calculateTotalPoints(criteria) {
    if (!criteria.items || !Array.isArray(criteria.items)) {
      return 0;
    }

    return criteria.items.reduce((total, item) => total + (item.points || 0), 0);
  }

  generateGradingRubric(criteria) {
    const rubric = {
      criteriaName: criteria.name,
      description: criteria.description,
      totalPoints: this.calculateTotalPoints(criteria),
      items: criteria.items.map(item => ({
        ...item,
        gradingLevels: this.generateGradingLevels(item)
      }))
    };

    return rubric;
  }

  generateGradingLevels(criteriaItem) {
    const points = criteriaItem.points;
    return {
      excellent: {
        range: [Math.ceil(points * 0.9), points],
        description: `Exceptional implementation of ${criteriaItem.name.toLowerCase()}. All requirements met with advanced techniques.`
      },
      good: {
        range: [Math.ceil(points * 0.7), Math.ceil(points * 0.89)],
        description: `Good implementation of ${criteriaItem.name.toLowerCase()}. Most requirements met with minor issues.`
      },
      satisfactory: {
        range: [Math.ceil(points * 0.5), Math.ceil(points * 0.69)],
        description: `Basic implementation of ${criteriaItem.name.toLowerCase()}. Core requirements met but lacks sophistication.`
      },
      needsImprovement: {
        range: [1, Math.ceil(points * 0.49)],
        description: `Incomplete or incorrect implementation of ${criteriaItem.name.toLowerCase()}. Significant improvements needed.`
      },
      notPresent: {
        range: [0, 0],
        description: `${criteriaItem.name} not implemented or not found in the submission.`
      }
    };
  }

  exportTemplate(id, format = 'json') {
    const template = this.getTemplate(id);
    if (!template) {
      throw new Error('Template not found');
    }

    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(template, null, 2);
      case 'csv':
        return this.templateToCsv(template);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  templateToCsv(template) {
    const headers = ['Item Name', 'Description', 'Points', 'Weight', 'Keywords', 'Examples'];
    const rows = [headers];

    template.items.forEach(item => {
      rows.push([
        item.name,
        item.description,
        item.points,
        item.weight,
        (item.keywords || []).join('; '),
        (item.examples || []).join('; ')
      ]);
    });

    return rows.map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
  }

  importTemplate(data, format = 'json') {
    let template;

    switch (format.toLowerCase()) {
      case 'json':
        template = typeof data === 'string' ? JSON.parse(data) : data;
        break;
      default:
        throw new Error(`Unsupported import format: ${format}`);
    }

    const errors = this.validateCriteria(template);
    if (errors.length > 0) {
      throw new Error(`Invalid template data: ${errors.join(', ')}`);
    }

    // Remove ID to create a new template
    delete template.id;
    template.createdAt = new Date().toISOString();
    template.lastModified = new Date().toISOString();

    return this.createTemplate(template.name, template.description, template.items);
  }

  generateId() {
    return `criteria_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  searchTemplates(query) {
    const lowercaseQuery = query.toLowerCase();
    return this.templates.filter(template =>
      template.name.toLowerCase().includes(lowercaseQuery) ||
      template.description.toLowerCase().includes(lowercaseQuery) ||
      template.items.some(item =>
        item.name.toLowerCase().includes(lowercaseQuery) ||
        item.description.toLowerCase().includes(lowercaseQuery)
      )
    );
  }
}

module.exports = CriteriaManager;