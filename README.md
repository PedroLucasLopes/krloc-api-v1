# 🚧 KRLoc

DotLog KRLoc is a entreprise dashboard manager for a business that rent construction site tools and machines for a worker daily tasks, basically we manage every single rent by his contract and contract owner leases for his property

---

## 🧑🏻‍💻 Project Technologies

### ⚡ Nest.js  
NestJS is a powerful, open-source framework for building scalable server-side applications using JavaScript and TypeScript. Built on top of Node.js and powered by Chrome’s V8 engine, it leverages a non-blocking, event-driven architecture to deliver high-performance and efficient applications—especially suited for real-time APIs and microservices.

NestJS provides a robust, modular architecture inspired by Angular, promoting clean code organization and maintainability. It also integrates seamlessly with the vast npm ecosystem, enabling developers to build end-to-end applications using a single language while taking advantage of modern design patterns and tooling.

### 🛠️ Prisma  
Prisma is a modern, type-safe ORM for Node.js and TypeScript. It offers **auto-completion**, easy migrations, and a declarative schema that integrates smoothly with relational databases (PostgreSQL, MySQL, SQLite) and MongoDB.

### 🔒 OAuth 2.0 + PKCE
OAuth 2.0 with PKCE (Proof Key for Code Exchange) is a secure authorization flow designed for public clients such as single-page applications and mobile apps. It enhances the standard Authorization Code flow by adding a dynamically generated secret (code_verifier) and its hashed version (code_challenge), preventing authorization code interception attacks.

The client initiates the flow by redirecting the user to the authorization server with a code_challenge. After authentication, the server returns an authorization code, which the client exchanges for an access token by sending the original code_verifier. The server validates it against the initial challenge, ensuring that only the original client can complete the flow.

### 🔑 JWT  
JSON Web Token is a compact and secure way to transmit information between parties. Widely used for authentication and authorization, **JWT is stateless**, supports fine-grained access control, and scales effortlessly across distributed systems.

---

## 🎯 Project Specifications

The codebase focuses on:
- **Low learning curve** – easy onboarding for new contributors.  
- **Clean structure and responsiveness** – simplifying future features and fixes.

---

## ⚙️ Architecture

The application is currently structured as a **monolith**, which has enabled rapid development and simplified initial deployment. However, as the system grows, this approach introduces limitations in scalability, maintainability, and flexibility.

The next step is to evolve toward a **modular monolith** architecture, organizing the codebase into well-defined, loosely coupled modules with clear boundaries. This transition will improve maintainability, enable independent evolution of features, and prepare the system for a potential future migration to microservices if needed.

In parallel, the infrastructure will be modernized with the adoption of **🚢 Kubernetes** to support **container orchestration**, scalability, and resilience. The introduction of an **API Gateway** will centralize request handling, while **load balancing** will ensure efficient traffic distribution and high availability.

Additionally, communication between modules/services will be redesigned to follow loosely coupled principles, reducing dependencies and increasing system robustness, scalability, and ease of change.

### 📁 Folder Structure (Macro View)
---
```bash
🗂️ prisma/
├─ 📜 migrations/
└─ 📝 schema.prisma


💻 src/
├─ 🧩 global/
│ ├─ 🏛️ address/
│ ├─ 🎓 assets/
│ ├─ 🕹️ decorators/
│ ├─ 🗄️ dto/
│ ├─ 🛣️ error/
│ ├─ ⚙️ guard/
│ ├─ 🧪 interceptors/
│ ├─ 🔗 redis/
│ ├─ 🧩 types/
│ ├─ 🛣️ utils/
├─ 🔐 routes/
│ ├─ 🕹️ accessory/
│ │   ├─ 🗄️ controller/
│ │   ├─ 🧩 dto/
│ │   ├─ ⚙️ service/
│ ├─ 🔒 auth/
│ │   ├─ 🗄️ controller/
│ │   ├─ 🧩 dto/
│ │   ├─ ⚙️ service/
│ ├─ 💻 client/
│ │   ├─ 🗄️ controller/
│ │   ├─ 🧩 dto/
│ │   ├─ ⚙️ service/
│ ├─ 🗂️ document/
│ │   ├─ 🗄️ controller/
│ │   ├─ 🧩 dto/
│ │   ├─ ⚙️ service/
│ ├─ 🏡 elease/
│ │   ├─ 🗄️ controller/
│ │   ├─ 🧩 dto/
│ │   ├─ ⚙️ service/
│ ├─ 🔨 equipment/
│ │   ├─ 🗄️ controller/
│ │   ├─ 🧩 dto/
│ │   ├─ ⚙️ service/
│ ├─ 📜 file/
│ │   ├─ 🗄️ controller/
│ │   ├─ 🧩 dto/
│ │   ├─ ⚙️ service/
│ ├─ 💰 finantial/
│ │   ├─ 🗄️ controller/
│ │   ├─ 🧩 dto/
│ │   ├─ ⚙️ service/
│ ├─ 💵 lessee/
│ │   ├─ 🗄️ controller/
│ │   ├─ 🧩 dto/
└─    ├─ ⚙️ service/
```
---

### 🏗️ Macro Structure

- **🧩 Module**  
  Organizes all **feature-specific domains** within a **modular monolith architecture**. Each module has clear boundaries (domain-driven design), allowing independent evolution while remaining part of a single deployable application.  
  Modules are designed to be **future-ready for extraction into microservices** and interact through well-defined interfaces and **event-driven communication**.  
  Examples include:  
  - Cleaning staff management  
  - Internal employee records  
  - Course scheduling aligned with institutional rules  

- **🔁 Shared**  
  Contains **cross-cutting and reusable components** shared across all modules, ensuring consistency and reducing duplication.  
  This layer also abstracts integrations with external services and infrastructure.  
  Examples include:  
  - 🔐 Authentication & Authorization  
  - 🚨 Exception handling & logging  
  - 🧩 Middleware & interceptors  
  - 🛠️ Utilities & helpers  
  - 📡 Messaging abstractions (pub/sub, queues, streams)  

- **☁️ Infrastructure & Communication Layer**  
  Prepares the application for a **serverless, container-based architecture** orchestrated by Kubernetes.  
  Focuses on scalability, resilience, and loose coupling through event-driven design.  
  Key elements include:  
  - ⚖️ API Gateway for centralized request routing  
  - 🔀 Load balancing for traffic distribution and high availability  
  - 📩 Asynchronous messaging using SNS (pub/sub) and SQS (queue-based processing)  
  - 🌊 Streaming pipelines for real-time data processing  
  - 🔗 Loose coupling between modules/containers via events instead of direct dependencies  

---

### 📦 Third-Party Libs

- 🚀 **@nestjs/core (v11.0.1)**: Core framework for building scalable server-side applications.
- 🌍 **@nestjs/platform-express (v11.0.1)**: HTTP platform adapter for handling requests.
- ⚙️ **@nestjs/config (v4.0.3)**: Environment configuration management.

- 🌐 **axios (v1.13.6)**: HTTP client for external API communication.

- 🧾 **class-validator (v0.14.1)** + **class-transformer (v0.5.1)**: Data validation and transformation.

- 🛡️ **jsonwebtoken (v9.0.3)**: JWT-based authentication and authorization.

- 🗄️ **prisma (v7.4.2)** + **@prisma/client (v7.4.2)**: ORM for database access.

- 🔄 **ioredis (v5.10.1)**: Redis client for caching and distributed operations.

- 🔁 **rxjs (v7.8.1)**: Reactive programming support used by NestJS.

---

### 🧪 Dev & Testing

- 🧪 **jest (v29.7.0)**: Testing framework.
- 🔍 **supertest (v7.0.0)**: API testing utilities.

- 🧬 **typescript (v5.7.3)**: Static typing for JavaScript.
- 🧹 **eslint (v9.18.0)** + 🎨 **prettier (v3.4.2)**: Code quality and formatting.

---

## 🏃 Future Sprints
The current version of the project has delivered a functional **MVP (v1.0.0)**, providing core features for managing students and basic administrative functionalities. The next phase will focus on evolving the system into a **cloud-native, scalable architecture** with a strong emphasis on security and distributed systems design.

- **Containerization & Kubernetes Foundation**: Begin the migration to a container-based architecture using Docker, preparing the application for orchestration with Kubernetes. This will establish the foundation for scalability, resilience, and environment consistency across deployments.

- **SSO Integration Layer**: Introduce a centralized **Single Sign-On (SSO)** layer using **OAuth 2.0 + PKCE**, enabling secure and standardized authentication across the system. This layer will decouple authentication concerns from business logic and support future integration with external identity providers.

- **API Gateway & Traffic Management**:    Implement an API Gateway to centralize request routing, authentication, and rate limiting. Combined with load balancing, this will improve reliability and control over incoming traffic.

- **Event-Driven Communication**: Start introducing asynchronous communication patterns using messaging systems (e.g., SNS/SQS), enabling loose coupling between modules and preparing the system for distributed workloads.

- **Modular Monolith Evolution**: Continue restructuring the codebase into a **modular monolith**, ensuring clear boundaries between domains and enabling future extraction into microservices if needed.These improvements aim to transition the application from a simple MVP into a **secure, scalable, and cloud-ready platform**, aligned with modern backend architecture practices.

## 🔮 Planned Features – API Documentation (Future Sprints)

### 1️⃣ Docker + AWS + Kubernetes
| Feature                  | Description                                                                 | Notes / Configurations                                    |
|--------------------------|-----------------------------------------------------------------------------|-----------------------------------------------------------|
| Containerization         | Package the application using Docker                                        | Create Dockerfile and docker-compose for local setup     |
| Cloud Deployment         | Deploy app on AWS (EC2, RDS, S3, etc.)                                      | Use environment variables for secrets and configs        |
| Orchestration            | Manage containers with Kubernetes                                           | Define deployment, service, and ingress YAML files       |

---

## ✏️ Project Initialization

Clone the repository and install dependencies:

```bash
npm install
# or
yarn
Run Prisma migrations:

npx prisma migrate deploy
Start the development server:

npm run start:dev
# or
yarn start:dev
```

## 🧑🏻‍🎨 Author
Pedro Lucas Lopes Paraguai
Developer passionate about continuous learning and innovation across Front-end and Back-end technologies.
Five years of experience building scalable and maintainable web applications.

## 🏷️ Tags

![Node.js](https://img.shields.io/badge/Node.js-grey?logo=node.js&logoColor=green)
![NestJS](https://img.shields.io/badge/NestJS-grey?logo=nestjs&logoColor=e0234e)
![TypeScript](https://img.shields.io/badge/TypeScript-grey?logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-grey?logo=prisma)
![Redis](https://img.shields.io/badge/Redis-grey?logo=redis)
![Jest](https://img.shields.io/badge/Jest-grey?logo=jest)
![Git](https://img.shields.io/badge/Git-grey?logo=git)
