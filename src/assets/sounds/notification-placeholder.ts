/**
 * @fileoverview Som placeholder para notificações
 *
 * Este arquivo contém um som de notificação minimalista em formato data URL
 * para ser usado quando não houver arquivo de som real disponível.
 *
 * @module NotificationSound
 */

/**
 * Som de notificação em formato data URL
 *
 * Este é um som simples de "beep" gerado programaticamente.
 * Substitua por um arquivo MP3 real para melhor experiência.
 */
export const NOTIFICATION_SOUND_DATA_URL = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSl+zPHaizsIGGS57OScTgwOTqXh8bllHgU1jdXzzn0vBSF1xe7glEILElyx6OyrWBUIQ5zd8sFuIAUqgM/z2ow9CRdgt+vtng==';

/**
 * Toca o som de notificação placeholder
 */
export function playPlaceholderNotificationSound(): void {
  try {
    const audio = new Audio(NOTIFICATION_SOUND_DATA_URL);
    audio.volume = 0.3; // Volume baixo para não assustar
    audio.play().catch(error => {
      console.debug('[NotificationSound] Não foi possível tocar som placeholder', error);
    });
  } catch (error) {
    console.debug('[NotificationSound] Erro ao criar Audio element', error);
  }
}