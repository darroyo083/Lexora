package com.lexora.demo;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

@Component
public class PublicDemoAccessFilter extends OncePerRequestFilter {

    private static final Pattern BOOK_PATH = Pattern.compile(
        "^/api/books/([0-9a-fA-F-]{36})(?:/.*)?$"
    );

    private final boolean enabled;

    public PublicDemoAccessFilter(
        @Value("${lexora.public-demo.enabled:false}") boolean enabled
    ) {
        this.enabled = enabled;
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        if (!enabled || !decodedPath(request).startsWith("/api/books")) {
            filterChain.doFilter(request, response);
            return;
        }

        if (!(request.getMethod().equals("GET") || request.getMethod().equals("HEAD"))) {
            reject(response, HttpServletResponse.SC_FORBIDDEN, "PUBLIC_DEMO_READ_ONLY");
            return;
        }

        var matcher = BOOK_PATH.matcher(decodedPath(request));
        if (matcher.matches()
            && !matcher.group(1).equalsIgnoreCase(PublicDemoConstants.BOOK_ID.toString())) {
            reject(response, HttpServletResponse.SC_NOT_FOUND, "DEMO_BOOK_NOT_FOUND");
            return;
        }

        filterChain.doFilter(request, response);
    }

    /**
     * The decoded application path, so encoded separators cannot smuggle a
     * non-demo book past the filter (authorization must not depend on the
     * container's raw-URI handling). The context path is excluded; percent
     * sequences are decoded with the same UTF-8 assumption Spring uses.
     */
    private static String decodedPath(HttpServletRequest request) {
        var requestUri = request.getRequestURI();
        var contextPath = request.getContextPath();
        var raw = !contextPath.isEmpty() && requestUri.startsWith(contextPath)
            ? requestUri.substring(contextPath.length())
            : requestUri;
        return URLDecoder.decode(raw, StandardCharsets.UTF_8);
    }

    private static void reject(HttpServletResponse response, int status, String code)
        throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"code\":\"" + code + "\"}");
    }
}
