# Minimal multi-stage build for Render deployment.
# Stage 1: build the jar with Maven (matches pom.xml's java.version=21).
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B package -DskipTests

# Stage 2: run the jar on a slim JRE.
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
# Render sets $PORT at runtime; server.port=${PORT:8080} (application.properties) binds to it.
ENTRYPOINT ["java", "-jar", "app.jar"]
