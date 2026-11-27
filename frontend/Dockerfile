# Página web: se compila y se sirve con nginx, que además reenvía /api a la API (mismo dominio: cookies de primera parte).
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
# CA adicional OPCIONAL solo durante la compilación (redes con proxy); la imagen final (nginx) no la contiene.
RUN --mount=type=secret,id=extra_ca,required=false \
    sh -c 'if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca NPM_CONFIG_CAFILE=/run/secrets/extra_ca; fi; npm ci --no-audit --no-fund'
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
