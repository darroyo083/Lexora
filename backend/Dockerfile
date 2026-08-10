FROM maven:3.9.16-eclipse-temurin-21 AS dependencies

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pom.xml ./
RUN mvn dependency:go-offline --no-transfer-progress

FROM dependencies AS dev

COPY src/ ./src/

EXPOSE 8080

CMD ["mvn", "spring-boot:run", "--no-transfer-progress"]

FROM dependencies AS build

COPY src/ ./src/
RUN mvn package -DskipTests --no-transfer-progress

FROM eclipse-temurin:21-jre-alpine AS production

RUN addgroup -S lexora && adduser -S lexora -G lexora
WORKDIR /app
COPY --from=build /app/target/lexora-backend-0.1.0.jar /app/lexora-backend.jar
RUN mkdir -p /app/storage && chown -R lexora:lexora /app

USER lexora
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --retries=12 --start-period=30s \
  CMD wget --quiet --spider http://127.0.0.1:8080/api/books || exit 1

ENTRYPOINT ["java", "-jar", "/app/lexora-backend.jar"]
