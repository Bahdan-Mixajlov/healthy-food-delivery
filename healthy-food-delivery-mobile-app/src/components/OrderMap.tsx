import React from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { COLORS } from "../constants/theme";

interface OrderMapProps {
  latitude?: number;
  longitude?: number;
}

export default function OrderMap({
  latitude = 53.6693, // Дефолтные координаты (Гродно)
  longitude = 23.8131,
}: OrderMapProps) {
  // Генерируем HTML с картой Leaflet (OpenStreetMap)
  // и CSS-анимацией, которая повторяет вашу пульсацию
  const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
            body { padding: 0; margin: 0; background-color: #EEE; }
            html, body, #map { height: 100%; width: 100vw; }
            
            /* Убираем копирайт Leaflet для чистоты интерфейса */
            .leaflet-control-attribution { display: none; } 
            
            /* Стили для кастомного пульсирующего маркера */
            .pulse-wrapper {
                position: relative;
                width: 40px;
                height: 40px;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .pulse-ring {
                position: absolute;
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background-color: ${COLORS.primary};
                animation: pulseAnim 2s infinite cubic-bezier(0.4, 0, 0.2, 1);
            }
            .pulse-dot {
                position: absolute;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background-color: ${COLORS.primary};
                border: 2px solid #FFF;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                z-index: 2;
            }

            @keyframes pulseAnim {
                0% { transform: scale(0.33); opacity: 1; }
                100% { transform: scale(1); opacity: 0; }
            }
        </style>
    </head>
    <body>
        <div id="map"></div>
        <script>
            // Отключаем кнопки зума, чтобы карта выглядела как встроенный виджет
            var map = L.map('map', {
                zoomControl: false,
                attributionControl: false
            }).setView([${latitude}, ${longitude}], 15);

            // Подключаем бесплатные тайлы OpenStreetMap
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
            }).addTo(map);

            // Создаем кастомный HTML маркер с нашей пульсирующей анимацией
            var customIcon = L.divIcon({
                className: 'custom-div-icon',
                html: "<div class='pulse-wrapper'><div class='pulse-ring'></div><div class='pulse-dot'></div></div>",
                iconSize: [40, 40],
                iconAnchor: [20, 20] // Центрируем маркер
            });

            // Добавляем маркер на карту
            L.marker([${latitude}, ${longitude}], { icon: customIcon }).addTo(map);
        </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={["*"]}
        source={{ html: mapHtml }}
        style={styles.map}
        scrollEnabled={false} // Отключаем скролл самого WebView
        bounces={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EEE", // Фон-заглушка, пока грузится WebView
  },
  map: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
