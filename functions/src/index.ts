import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Инициализация Firebase Admin
admin.initializeApp();

const db = admin.firestore();

// Функция для начисления процентов по депозитам
// Запускается каждый день в 11:00 по ташкенту (06:00 UTC)
export const dailyDepositInterest = functions.pubsub
  .schedule('0 6 * * *') // 06:00 UTC = 11:00 по ташкенту
  .timeZone('Asia/Tashkent')
  .onRun(async (context) => {
    console.log('Начинаем начисление процентов по депозитам...');
    
    try {
      // Получаем все активные депозиты
      const depositsSnapshot = await db.collection('deposits')
        .where('status', '==', 'active')
        .get();
      
      if (depositsSnapshot.empty) {
        console.log('Нет активных депозитов для начисления процентов');
        return;
      }
      
      console.log(`Найдено ${depositsSnapshot.size} активных депозитов`);
      
      // Группируем депозиты по пользователям для оптимизации
      const userDeposits = new Map<string, any[]>();
      
      depositsSnapshot.forEach(doc => {
        const deposit = doc.data();
        const userId = deposit.userId;
        
        if (!userDeposits.has(userId)) {
          userDeposits.set(userId, []);
        }
        userDeposits.get(userId)!.push({
          id: doc.id,
          ...deposit
        });
      });
      
      // Начисляем проценты для каждого пользователя
      for (const [userId, deposits] of userDeposits) {
        try {
          let totalInterest = 0;
          
          // Рассчитываем проценты для каждого депозита пользователя
          for (const deposit of deposits) {
            const dailyIncome = (deposit.amount * deposit.interestRate / 100 / 365);
            totalInterest += dailyIncome;
            
            console.log(`Депозит ${deposit.id}: ${deposit.amount} CF, ставка ${deposit.interestRate}%, доход за день: ${dailyIncome.toFixed(4)} CF`);
          }
          
          // Обновляем баланс пользователя
          const userRef = db.collection('users').doc(userId);
          await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            
            if (userDoc.exists) {
              const userData = userDoc.data();
              const currentMoney = userData?.money || 0;
              const newMoney = currentMoney + totalInterest;
              
              transaction.update(userRef, {
                money: newMoney
              });
              
              console.log(`Пользователь ${userId}: начислено ${totalInterest.toFixed(4)} CF, новый баланс: ${newMoney.toFixed(2)} CF`);
            }
          });
          
        } catch (error) {
          console.error(`Ошибка при начислении процентов пользователю ${userId}:`, error);
        }
      }
      
      console.log('Начисление процентов завершено успешно');
      
    } catch (error) {
      console.error('Ошибка при начислении процентов:', error);
      throw error;
    }
  });

// Функция для ручного начисления процентов (для тестирования)
export const manualDepositInterest = functions.https.onCall(async (data, context) => {
  // Проверяем права администратора
  if (!context.auth || context.auth.uid !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Только администратор может запустить ручное начисление');
  }
  
  console.log('Ручное начисление процентов запущено администратором');
  
  try {
    // Получаем все активные депозиты
    const depositsSnapshot = await db.collection('deposits')
      .where('status', '==', 'active')
      .get();
    
    if (depositsSnapshot.empty) {
      return { message: 'Нет активных депозитов для начисления процентов' };
    }
    
    let totalProcessed = 0;
    let totalInterest = 0;
    
    // Группируем депозиты по пользователям
    const userDeposits = new Map<string, any[]>();
    
    depositsSnapshot.forEach(doc => {
      const deposit = doc.data();
      const userId = deposit.userId;
      
      if (!userDeposits.has(userId)) {
        userDeposits.set(userId, []);
      }
      userDeposits.get(userId)!.push({
        id: doc.id,
        ...deposit
      });
    });
    
    // Начисляем проценты
    for (const [userId, deposits] of userDeposits) {
      let userInterest = 0;
      
      for (const deposit of deposits) {
        const dailyIncome = (deposit.amount * deposit.interestRate / 100 / 365);
        userInterest += dailyIncome;
      }
      
      // Обновляем баланс пользователя
      const userRef = db.collection('users').doc(userId);
      await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          const currentMoney = userData?.money || 0;
          const newMoney = currentMoney + userInterest;
          
          transaction.update(userRef, {
            money: newMoney
          });
          
          totalInterest += userInterest;
          totalProcessed++;
        }
      });
    }
    
    return {
      message: `Начисление завершено. Обработано пользователей: ${totalProcessed}, общая сумма процентов: ${totalInterest.toFixed(2)} CF`
    };
    
  } catch (error) {
    console.error('Ошибка при ручном начислении процентов:', error);
    throw new functions.https.HttpsError('internal', 'Ошибка при начислении процентов');
  }
});
