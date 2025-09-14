import { config } from "dotenv";
import { nanoid } from "nanoid";
import { initializeDatabase, getDatabaseManager } from "./connection.js";
import {
  initializeEmbeddingService,
  getEmbeddingService,
} from "../lib/embeddings.js";

// Load environment variables
config();

interface SampleDocument {
  title: string;
  content: string;
  metadata?: Record<string, any>;
}

interface SampleConversation {
  title: string;
  userId?: string;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
}

// Sample documents for seeding
const sampleDocuments: SampleDocument[] = [
  {
    title: "Introduction to Machine Learning",
    content: `Machine Learning is a subset of artificial intelligence (AI) that focuses on the development of algorithms and statistical models that enable computer systems to improve their performance on a specific task through experience, without being explicitly programmed.

The field of machine learning is broadly categorized into three main types:

1. Supervised Learning: This involves training a model on a labeled dataset, meaning the input data is paired with the correct output. Common algorithms include linear regression, decision trees, and neural networks. Examples include email spam detection, image classification, and price prediction.

2. Unsupervised Learning: Here, the model learns patterns from input data without any labeled examples. The goal is to discover hidden structures in the data. Clustering, dimensionality reduction, and association rule mining are common techniques. Applications include customer segmentation, anomaly detection, and data compression.

3. Reinforcement Learning: This involves an agent learning to make decisions by performing actions in an environment and receiving feedback in the form of rewards or penalties. The agent learns to maximize cumulative reward over time. This approach is used in game playing, robotics, and autonomous systems.

Key concepts in machine learning include:
- Training and validation datasets
- Feature engineering and selection
- Model evaluation metrics (accuracy, precision, recall, F1-score)
- Overfitting and underfitting
- Cross-validation
- Hyperparameter tuning

Popular machine learning frameworks include TensorFlow, PyTorch, Scikit-learn, and Keras. The choice of framework often depends on the specific use case, performance requirements, and team expertise.`,
    metadata: {
      category: "education",
      topic: "machine-learning",
      difficulty: "beginner",
      author: "AI Education Team",
    },
  },
  {
    title: "Web Development Best Practices",
    content: `Web development has evolved significantly over the years, and following best practices is crucial for creating maintainable, scalable, and secure applications. Here are key practices every web developer should follow:

## Frontend Development

### HTML Best Practices
- Use semantic HTML elements (header, nav, main, section, article, aside, footer)
- Ensure proper document structure and hierarchy
- Include proper meta tags for SEO and accessibility
- Validate HTML markup regularly
- Use appropriate alt text for images

### CSS Best Practices
- Use CSS preprocessors like Sass or Less for better organization
- Follow BEM (Block Element Modifier) methodology for naming conventions
- Implement responsive design with mobile-first approach
- Use CSS Grid and Flexbox for modern layouts
- Minimize and optimize CSS for production

### JavaScript Best Practices
- Use modern ES6+ features appropriately
- Implement proper error handling with try-catch blocks
- Follow the principle of separation of concerns
- Use TypeScript for better type safety
- Implement proper code splitting and lazy loading

## Backend Development

### API Design
- Follow RESTful principles for API design
- Use appropriate HTTP status codes
- Implement proper versioning strategies
- Document APIs thoroughly with tools like OpenAPI/Swagger
- Use consistent naming conventions

### Security
- Implement proper authentication and authorization
- Use HTTPS everywhere
- Validate and sanitize all user inputs
- Implement rate limiting and DDoS protection
- Keep dependencies updated and scan for vulnerabilities
- Use environment variables for sensitive configuration

### Database
- Design normalized database schemas
- Use prepared statements to prevent SQL injection
- Implement proper indexing for query performance
- Set up regular backups and disaster recovery
- Monitor database performance and optimize queries

## Performance Optimization
- Minimize HTTP requests
- Optimize images and use appropriate formats
- Implement caching strategies (browser, CDN, server-side)
- Use compression for static assets
- Minimize and bundle JavaScript and CSS
- Implement lazy loading for images and content
- Use performance monitoring tools

## Testing
- Write unit tests for critical functionality
- Implement integration tests for APIs
- Use end-to-end testing for user workflows
- Set up continuous integration pipelines
- Maintain good test coverage (aim for 80%+)

## Deployment and DevOps
- Use version control effectively (Git best practices)
- Implement continuous integration and deployment
- Use containerization (Docker) for consistency
- Set up proper monitoring and logging
- Implement blue-green or rolling deployments
- Have rollback strategies in place`,
    metadata: {
      category: "development",
      topic: "web-development",
      difficulty: "intermediate",
      author: "Development Team",
    },
  },
  {
    title: "The Future of Renewable Energy",
    content: `Renewable energy represents one of the most promising solutions to address climate change and reduce our dependence on fossil fuels. As technology advances and costs continue to decline, renewable energy sources are becoming increasingly viable and attractive alternatives to traditional energy production methods.

## Solar Energy
Solar power has experienced dramatic cost reductions over the past decade. Photovoltaic (PV) technology has improved significantly, with modern solar panels achieving efficiency rates of over 20%. Innovations in solar technology include:

- Perovskite solar cells showing potential for even higher efficiency
- Solar panel recycling programs to address end-of-life concerns
- Floating solar farms that utilize water surfaces
- Agrivoltaics combining agriculture with solar energy production
- Building-integrated photovoltaics (BIPV) for seamless integration into architecture

## Wind Energy
Wind power continues to be one of the fastest-growing renewable energy sources globally. Offshore wind farms are becoming increasingly popular due to stronger and more consistent winds over water. Key developments include:

- Larger, more efficient turbines with longer blades
- Floating wind turbines for deep-water installations
- Vertical axis wind turbines for urban environments
- Advanced materials reducing maintenance requirements
- Smart grid integration for better energy distribution

## Energy Storage Solutions
One of the biggest challenges for renewable energy has been storage and grid stability. Recent advances in battery technology are addressing these concerns:

- Lithium-ion battery costs have dropped by 90% since 2010
- Grid-scale battery storage systems are being deployed worldwide
- Pumped hydro storage continues to be the most widely used large-scale storage
- Emerging technologies like compressed air energy storage (CAES)
- Green hydrogen production using excess renewable energy

## Smart Grid Technology
The integration of renewable energy sources requires sophisticated grid management systems:

- Demand response programs that adjust consumption based on supply
- Microgrids that can operate independently or connected to the main grid
- Advanced forecasting systems for renewable energy generation
- Vehicle-to-grid (V2G) technology using electric vehicles as mobile storage
- Blockchain-based energy trading platforms for peer-to-peer energy sales

## Economic Impact
The renewable energy sector has become a significant economic driver:

- Job creation in manufacturing, installation, and maintenance
- Energy independence reducing reliance on energy imports
- Stabilized energy costs as renewable sources have no fuel costs
- Rural economic development through wind and solar projects
- Investment opportunities in clean energy technologies

## Challenges and Solutions
Despite the progress, several challenges remain:

- Intermittency issues requiring better forecasting and storage
- Grid infrastructure updates needed for distributed generation
- Policy and regulatory frameworks needing modernization
- Public acceptance and NIMBYism (Not In My Backyard) concerns
- Recycling and disposal of renewable energy equipment

## Global Outlook
The International Energy Agency (IEA) projects that renewables will account for 90% of the increase in global power capacity through 2025. Countries worldwide are setting ambitious renewable energy targets, with many aiming for carbon neutrality by 2050.

The future of renewable energy looks bright, with continued technological improvements, cost reductions, and supportive policies driving adoption. As we face the urgent need to address climate change, renewable energy will play a crucial role in creating a sustainable energy future.`,
    metadata: {
      category: "environment",
      topic: "renewable-energy",
      difficulty: "intermediate",
      author: "Environmental Research Team",
    },
  },
  {
    title: "Database Design Principles",
    content: `Effective database design is fundamental to building robust, scalable, and maintainable applications. Good database design ensures data integrity, optimal performance, and flexibility for future requirements. Here are the essential principles and best practices for database design:

## Normalization

### First Normal Form (1NF)
- Each table cell should contain only a single value
- Each column should have a unique name
- The order in which data is stored should not matter
- No repeating groups or arrays within columns

### Second Normal Form (2NF)
- Must be in 1NF
- All non-key attributes must be fully functionally dependent on the primary key
- Eliminate partial dependencies in composite key scenarios

### Third Normal Form (3NF)
- Must be in 2NF
- No transitive dependencies
- Non-key attributes should not depend on other non-key attributes

### Beyond 3NF
While higher normal forms exist (BCNF, 4NF, 5NF), most practical applications achieve optimal design at 3NF. Sometimes controlled denormalization is acceptable for performance reasons.

## Entity-Relationship Modeling

### Entities
- Represent real-world objects or concepts
- Should have a clear purpose and meaning
- Must have at least one attribute that uniquely identifies instances
- Follow consistent naming conventions

### Relationships
- One-to-one (1:1): Each instance of entity A relates to exactly one instance of entity B
- One-to-many (1:M): Each instance of entity A can relate to multiple instances of entity B
- Many-to-many (M:N): Multiple instances of entity A can relate to multiple instances of entity B

### Attributes
- Choose appropriate data types for each attribute
- Define constraints (NOT NULL, CHECK, DEFAULT)
- Consider the domain of possible values
- Use meaningful and consistent names

## Key Design Principles

### Primary Keys
- Every table should have a primary key
- Primary keys should be stable (not changing over time)
- Consider using surrogate keys (auto-incrementing integers or UUIDs) for complex natural keys
- Avoid using business data as primary keys when possible

### Foreign Keys
- Maintain referential integrity through foreign key constraints
- Define appropriate actions for cascading updates and deletes
- Consider the performance implications of foreign key checks
- Use indexes on foreign key columns

### Indexes
- Create indexes on frequently queried columns
- Consider composite indexes for multi-column queries
- Avoid over-indexing as it impacts insert/update performance
- Regularly analyze and optimize index usage

## Data Types and Constraints

### Choosing Appropriate Data Types
- Use the most restrictive data type that accommodates all valid values
- Consider storage requirements and performance implications
- Use appropriate precision for numeric data
- Choose between CHAR and VARCHAR based on data characteristics

### Implementing Constraints
- Use CHECK constraints to enforce business rules at the database level
- Implement NOT NULL constraints where appropriate
- Use UNIQUE constraints for alternate keys
- Consider using triggers for complex constraints

## Performance Considerations

### Query Optimization
- Design tables to support common query patterns
- Consider query performance during the design phase
- Use appropriate indexing strategies
- Avoid premature optimization but plan for scale

### Partitioning
- Consider table partitioning for very large tables
- Partition by date, range, or hash based on access patterns
- Understand the implications of partitioning on queries and maintenance

### Denormalization
- Sometimes controlled denormalization improves performance
- Consider read vs. write performance trade-offs
- Maintain data consistency when denormalizing
- Document any denormalization decisions and their rationale

## Security Considerations

### Access Control
- Implement proper user roles and permissions
- Use principle of least privilege
- Consider row-level security for sensitive data
- Regularly audit database access

### Data Protection
- Encrypt sensitive data at rest and in transit
- Use secure authentication mechanisms
- Implement proper backup and recovery procedures
- Consider data masking for development environments

## Scalability and Future Considerations

### Horizontal vs. Vertical Scaling
- Design with scalability in mind from the beginning
- Consider sharding strategies for horizontal scaling
- Understand the limitations of vertical scaling
- Plan for distributed database scenarios

### Schema Evolution
- Design schemas that can evolve with changing requirements
- Use migration scripts for schema changes
- Consider backward compatibility when possible
- Plan for zero-downtime deployments

## Documentation and Maintenance

### Documentation
- Maintain up-to-date entity-relationship diagrams
- Document business rules and constraints
- Keep data dictionaries current
- Document any deviations from standard practices

### Regular Maintenance
- Monitor database performance regularly
- Update statistics for query optimization
- Perform regular integrity checks
- Plan for capacity growth

By following these database design principles, you can create robust, efficient, and maintainable database systems that serve as a solid foundation for your applications.`,
    metadata: {
      category: "development",
      topic: "database-design",
      difficulty: "advanced",
      author: "Database Architecture Team",
    },
  },
  {
    title: "Introduction to TypeScript",
    content: `TypeScript is a statically typed superset of JavaScript that compiles to plain JavaScript. Developed by Microsoft, TypeScript adds optional static typing to JavaScript, enabling developers to catch errors early in the development process and build more robust applications.

## Why Use TypeScript?

### Static Typing Benefits
- Catch errors at compile time rather than runtime
- Improved IDE support with better IntelliSense and refactoring
- Enhanced code documentation through type annotations
- Better collaboration in team environments
- Easier maintenance of large codebases

### JavaScript Compatibility
- All valid JavaScript is valid TypeScript
- Gradual adoption possible in existing projects
- Compiles to readable JavaScript
- Supports all modern JavaScript features

## Basic Types

### Primitive Types
TypeScript supports all JavaScript primitive types with type annotations:

\`\`\`typescript
let isDone: boolean = false;
let decimal: number = 6;
let color: string = "blue";
let templateString: string = \`Hello, \${color}\`;
\`\`\`

### Arrays
Arrays can be typed in two ways:

\`\`\`typescript
let list1: number[] = [1, 2, 3];
let list2: Array<number> = [1, 2, 3];
\`\`\`

### Tuples
Tuples allow you to express an array with a fixed number of elements:

\`\`\`typescript
let x: [string, number] = ["hello", 10];
\`\`\`

### Enums
Enums provide a way to give friendly names to sets of numeric values:

\`\`\`typescript
enum Color { Red, Green, Blue }
let c: Color = Color.Green;
\`\`\`

## Advanced Types

### Interfaces
Interfaces define the shape of objects:

\`\`\`typescript
interface Person {
  firstName: string;
  lastName: string;
  age?: number; // Optional property
}

function greet(person: Person) {
  return \`Hello, \${person.firstName} \${person.lastName}\`;
}
\`\`\`

### Classes
TypeScript enhances JavaScript classes with type annotations and access modifiers:

\`\`\`typescript
class Animal {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  public move(distance: number): void {
    console.log(\`\${this.name} moved \${distance}m.\`);
  }
}
\`\`\`

### Generics
Generics provide a way to make components work with any data type:

\`\`\`typescript
function identity<T>(arg: T): T {
  return arg;
}

let output = identity<string>("myString");
\`\`\`

## TypeScript Configuration

### tsconfig.json
The tsconfig.json file specifies the root files and compiler options:

\`\`\`json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
\`\`\`

## Best Practices

### Use Strict Mode
Enable strict type checking options in tsconfig.json for better type safety.

### Prefer Interfaces Over Type Aliases
Use interfaces for object shapes that might be extended or implemented.

### Use Union Types
Union types provide flexibility while maintaining type safety:

\`\`\`typescript
type Status = "loading" | "success" | "error";
\`\`\`

### Leverage Type Guards
Type guards help narrow types at runtime:

\`\`\`typescript
function isString(value: unknown): value is string {
  return typeof value === "string";
}
\`\`\`

TypeScript significantly improves the JavaScript development experience by providing static typing, better tooling, and enhanced code quality. It's particularly valuable for large applications and teams where type safety and code maintainability are crucial.`,
    metadata: {
      category: "development",
      topic: "typescript",
      difficulty: "beginner",
      author: "TypeScript Team",
    },
  },
];

// Sample conversations for seeding
const sampleConversations: SampleConversation[] = [
  {
    title: "Getting Started with Machine Learning",
    userId: "user-1",
    messages: [
      {
        role: "user",
        content:
          "I'm new to machine learning. Can you help me understand the basics?",
      },
      {
        role: "assistant",
        content:
          "I'd be happy to help you get started with machine learning! Machine learning is a subset of artificial intelligence that enables computers to learn and make decisions from data without being explicitly programmed for every scenario.\n\nThere are three main types:\n1. **Supervised Learning** - Learning from labeled examples (like email spam detection)\n2. **Unsupervised Learning** - Finding patterns in unlabeled data (like customer segmentation)\n3. **Reinforcement Learning** - Learning through trial and error with rewards/penalties\n\nWhat specific area interests you most, or do you have a particular problem you'd like to solve?",
      },
      {
        role: "user",
        content:
          "I'm interested in using ML for image classification. Where should I start?",
      },
      {
        role: "assistant",
        content:
          "Great choice! Image classification is a popular and practical application of machine learning. Here's a roadmap to get you started:\n\n**1. Learn the Basics:**\n- Understand how images are represented as numbers (pixels)\n- Learn about Convolutional Neural Networks (CNNs)\n- Familiarize yourself with concepts like features, layers, and activation functions\n\n**2. Tools and Frameworks:**\n- Start with Python and libraries like TensorFlow or PyTorch\n- Use Jupyter notebooks for experimentation\n- Consider using pre-built platforms like Google Colab for free GPU access\n\n**3. First Project:**\n- Begin with a simple dataset like CIFAR-10 or Fashion-MNIST\n- Try transfer learning with pre-trained models (like ResNet or VGG)\n- This gives you good results quickly while you learn\n\n**4. Key Concepts to Master:**\n- Data preprocessing and augmentation\n- Model evaluation metrics (accuracy, precision, recall)\n- Overfitting and how to prevent it\n\nWould you like me to elaborate on any of these steps or help you choose a specific first project?",
      },
    ],
  },
  {
    title: "Web Development Architecture Discussion",
    userId: "user-2",
    messages: [
      {
        role: "user",
        content:
          "I'm designing a new web application and trying to decide between a monolithic architecture and microservices. What factors should I consider?",
      },
      {
        role: "assistant",
        content:
          "That's a crucial architectural decision! Let me break down the key factors to consider:\n\n**Team Size & Experience:**\n- Monolithic: Better for small teams (2-8 developers) or teams new to distributed systems\n- Microservices: Requires experienced teams comfortable with distributed systems, DevOps, and service communication\n\n**Application Complexity:**\n- Monolithic: Suitable for applications with tightly coupled features\n- Microservices: Better when you can clearly separate business domains\n\n**Scalability Needs:**\n- Monolithic: Scale the entire application together\n- Microservices: Scale individual services based on demand\n\n**Development Speed:**\n- Monolithic: Faster initial development and easier debugging\n- Microservices: Slower initially but enables parallel team development\n\n**Deployment & Operations:**\n- Monolithic: Simpler deployment but all-or-nothing updates\n- Microservices: Complex deployment but independent service updates\n\n**My recommendation:** Start with a well-structured monolith and extract microservices later when you have clear service boundaries and the team/infrastructure to support them.\n\nWhat's the scale and complexity of your application? How large is your team?",
      },
      {
        role: "user",
        content:
          "We're a team of 4 developers building a content management system with user authentication, content creation, and analytics. Expected to handle about 10,000 daily active users.",
      },
      {
        role: "assistant",
        content:
          "Based on your situation, I'd strongly recommend starting with a **monolithic architecture**. Here's why it's perfect for your case:\n\n**Why Monolithic is Right for You:**\n\n1. **Team Size (4 developers):** Perfect size for a monolith. You can move fast without the coordination overhead of microservices\n\n2. **Scale (10K DAU):** A well-built monolith can easily handle this traffic. You're nowhere near needing the complexity of microservices for scale\n\n3. **Feature Set:** Your features (auth, content, analytics) are likely interconnected and benefit from being in one codebase\n\n**Recommended Architecture:**\n```\nFrontend (React/Vue) ↔ API Layer ↔ Business Logic ↔ Database\n```\n\n**Structure your monolith well:**\n- Use clear module boundaries (auth/, content/, analytics/)\n- Implement proper layering (controllers, services, repositories)\n- Keep your database schema organized\n- Use dependency injection for testability\n\n**Plan for Growth:**\n- Design with clear service boundaries in mind\n- Use feature flags for gradual rollouts\n- Implement proper monitoring and logging\n- When you reach ~15-20 developers or need independent scaling, consider extracting services\n\n**Technology Stack Suggestions:**\n- Node.js/Express, Python/Django, or Java/Spring Boot\n- PostgreSQL or MySQL for primary data\n- Redis for caching and sessions\n- Docker for consistent environments\n\nWould you like specific guidance on any part of this architecture?",
      },
    ],
  },
  {
    title: "Database Performance Optimization",
    userId: "user-3",
    messages: [
      {
        role: "user",
        content:
          "My PostgreSQL database is getting slow. The main table has about 5 million rows. What should I check first?",
      },
      {
        role: "assistant",
        content:
          "5 million rows can definitely cause performance issues if not optimized properly. Let's diagnose this systematically:\n\n**1. First, Check Your Slow Queries:**\n```sql\n-- Enable slow query logging\nSET log_statement = 'all';\nSET log_min_duration_statement = 1000; -- Log queries taking >1s\n\n-- Check currently running queries\nSELECT query, state, query_start, now() - query_start as duration \nFROM pg_stat_activity \nWHERE state = 'active' AND query != '<IDLE>';\n```\n\n**2. Analyze Query Performance:**\n```sql\nEXPLAIN ANALYZE your_slow_query;\n```\nLook for:\n- Seq Scan (table scans) instead of Index Scan\n- High cost numbers\n- Long execution times\n\n**3. Check Missing Indexes:**\n```sql\n-- Find tables with high sequential scan ratios\nSELECT \n  schemaname,\n  tablename,\n  seq_scan,\n  seq_tup_read,\n  idx_scan,\n  seq_tup_read / seq_scan as avg_seq_read\nFROM pg_stat_user_tables \nWHERE seq_scan > 0\nORDER BY seq_tup_read DESC;\n```\n\n**4. Quick Wins to Try:**\n- Add indexes on frequently WHERE/JOIN columns\n- Update table statistics: `ANALYZE your_table;`\n- Check if `auto_vacuum` is running\n\n**Most Common Issues with 5M+ Rows:**\n1. Missing indexes on filter columns\n2. Outdated statistics\n3. Inefficient queries (N+1 problems)\n4. No connection pooling\n\nWhat type of queries are running slow? SELECT/INSERT/UPDATE? And what does your current indexing look like?",
      },
    ],
  },
];

async function seedDatabase() {
  console.log("🌱 Starting database seeding...");

  try {
    // Initialize services
    console.log("🔧 Initializing services...");
    const dbManager = await initializeDatabase();
    const embeddingService = await initializeEmbeddingService();

    // Get initial stats
    const initialStats = dbManager.getStats();
    console.log("📊 Initial database state:");
    console.log(`  - Documents: ${initialStats.documents}`);
    console.log(`  - Embeddings: ${initialStats.embeddings}`);
    console.log(`  - Conversations: ${initialStats.conversations}`);
    console.log(`  - Messages: ${initialStats.messages}`);

    // Seed documents
    console.log("\n📝 Seeding sample documents...");
    for (const [index, sampleDoc] of sampleDocuments.entries()) {
      const documentId = nanoid();

      console.log(
        `  ${index + 1}/${sampleDocuments.length} - Creating: "${sampleDoc.title}"`,
      );

      // Insert document
      dbManager.run(
        "INSERT INTO documents (id, title, content, metadata) VALUES (?, ?, ?, ?)",
        documentId,
        sampleDoc.title,
        sampleDoc.content,
        JSON.stringify(sampleDoc.metadata || {}),
      );

      // Process embeddings
      console.log(`    📊 Processing embeddings for "${sampleDoc.title}"...`);
      await embeddingService.processDocument(
        documentId,
        sampleDoc.content,
        sampleDoc.title,
        sampleDoc.metadata,
      );
    }

    console.log("✅ Documents seeded successfully");

    // Seed conversations
    console.log("\n💬 Seeding sample conversations...");
    for (const [index, sampleConv] of sampleConversations.entries()) {
      const conversationId = nanoid();

      console.log(
        `  ${index + 1}/${sampleConversations.length} - Creating: "${sampleConv.title}"`,
      );

      // Insert conversation
      dbManager.run(
        "INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)",
        conversationId,
        sampleConv.userId || null,
        sampleConv.title,
      );

      // Insert messages
      for (const message of sampleConv.messages) {
        const messageId = nanoid();
        dbManager.run(
          "INSERT INTO messages (id, conversation_id, role, content, metadata) VALUES (?, ?, ?, ?, ?)",
          messageId,
          conversationId,
          message.role,
          message.content,
          "{}",
        );
      }
    }

    console.log("✅ Conversations seeded successfully");

    // Get final stats
    const finalStats = dbManager.getStats();
    console.log("\n📊 Final database state:");
    console.log(
      `  - Documents: ${finalStats.documents} (+${finalStats.documents - initialStats.documents})`,
    );
    console.log(
      `  - Embeddings: ${finalStats.embeddings} (+${finalStats.embeddings - initialStats.embeddings})`,
    );
    console.log(
      `  - Conversations: ${finalStats.conversations} (+${finalStats.conversations - initialStats.conversations})`,
    );
    console.log(
      `  - Messages: ${finalStats.messages} (+${finalStats.messages - initialStats.messages})`,
    );
    console.log(`  - Database size: ${finalStats.dbSizeMB} MB`);

    // Test vector search
    console.log("\n🔍 Testing vector search...");
    const searchResults = await embeddingService.searchSimilar(
      "machine learning algorithms",
      {
        limit: 3,
        threshold: 0.5,
      },
    );

    if (searchResults.length > 0) {
      console.log(
        `✅ Vector search working! Found ${searchResults.length} results:`,
      );
      searchResults.forEach((result, index) => {
        console.log(
          `  ${index + 1}. Similarity: ${result.similarity.toFixed(3)} - "${result.chunk.content.substring(0, 100)}..."`,
        );
      });
    } else {
      console.log(
        "⚠️ No search results found. This might indicate an issue with embeddings.",
      );
    }

    console.log("\n🎉 Database seeding completed successfully!");
    console.log("\nYou can now:");
    console.log("1. Start the server: bun run dev");
    console.log("2. Test the API endpoints");
    console.log("3. Try vector search with: POST /api/search");
    console.log("4. Start a chat conversation: POST /api/chat");
  } catch (error) {
    console.error("❌ Database seeding failed:", error);

    if (error instanceof Error) {
      console.error("Error details:", error.message);
      console.error("Stack trace:", error.stack);
    }

    process.exit(1);
  }
}

// Handle script execution
if (import.meta.main) {
  seedDatabase().catch((error) => {
    console.error("❌ Seeding script failed:", error);
    process.exit(1);
  });
}

export { seedDatabase };
