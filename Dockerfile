FROM nginx:alpine

WORKDIR /etc/nginx

# Copy nginx configuration
COPY ./nginx.conf ./conf.d/default.conf

# Copy JavaScript files to nginx html directory
COPY ./launcher.js /usr/share/nginx/html/
COPY ./Auto-Farm.js /usr/share/nginx/html/
COPY ./Auto-Image.js /usr/share/nginx/html/

# Create a simple index.html for easy access
RUN echo '<!DOCTYPE html><html><head><title>WPlace AutoBOT Scripts</title></head><body><h1>WPlace AutoBOT Scripts</h1><ul><li><a href="/launcher.js">launcher.js</a></li><li><a href="/Auto-Farm.js">Auto-Farm.js</a></li><li><a href="/Auto-Image.js">Auto-Image.js</a></li></ul></body></html>' > /usr/share/nginx/html/index.html

EXPOSE 80
ENTRYPOINT [ "nginx" ]
CMD [ "-g", "daemon off;" ]