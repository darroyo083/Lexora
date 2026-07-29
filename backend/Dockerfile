FROM maven:3.9.16-eclipse-temurin-21

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pom.xml ./
RUN mvn dependency:go-offline --no-transfer-progress

COPY src/ ./src/

EXPOSE 8080

CMD ["mvn", "spring-boot:run", "--no-transfer-progress"]
