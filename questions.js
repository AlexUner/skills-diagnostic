window.QUESTIONS = [
  {
    id: 'java-equals', topic: 'Java', title: 'Как сравнить содержимое двух строк?',
    description: 'Нужно проверить, что две переменные String содержат одинаковый текст.',
    code: 'String a = new String("hello");\nString b = new String("hello");',
    choices: ['a == b', 'a.equals(b)', 'a = b', 'a.compareTo(b) == 1'],
    correct: 1, explanation: 'equals сравнивает содержимое строк; == сравнивает ссылки на объекты.'
  },
  {
    id: 'java-list', topic: 'Java', title: 'Что вернет этот код?',
    description: 'Список уже содержит два элемента.',
    code: 'List<String> names = List.of("Аня", "Борис");\nSystem.out.println(names.get(1));',
    choices: ['Аня', 'Борис', '1', 'Исключение IndexOutOfBoundsException'],
    correct: 1, explanation: 'Индексы списка начинаются с нуля, поэтому индекс 1 указывает на второй элемент.'
  },
  {
    id: 'java-map', topic: 'Java', title: 'Что удобно использовать для подсчета повторов?',
    description: 'Нужно посчитать, сколько раз встречается каждое слово в списке.',
    choices: ['Map<String, Integer>', 'Set<String>', 'StringBuilder', 'Optional<String>'],
    correct: 0, explanation: 'Map хранит слово как ключ и число повторов как значение.'
  },
  {
    id: 'java-null', topic: 'Java', title: 'Как избежать ошибки при возможном null?',
    description: 'Переменная userName может быть null. Нужно проверить, что она равна строке "admin".',
    choices: ['userName.equals("admin")', '"admin".equals(userName)', 'userName == "admin"', 'userName.compareTo("admin") == 0'],
    correct: 1, explanation: 'Вызов equals у заведомо ненулевой строки безопасен, даже если userName равен null.'
  },
  {
    id: 'sql-null', topic: 'SQL', title: 'Как найти строки без даты отправки?',
    description: 'В таблице messages поле sent_at может быть NULL.',
    choices: ['WHERE sent_at = NULL', 'WHERE sent_at IS NULL', 'WHERE sent_at == NULL', 'WHERE sent_at EMPTY'],
    correct: 1, explanation: 'NULL проверяют оператором IS NULL.'
  },
  {
    id: 'sql-left-join', topic: 'SQL', title: 'Как оставить в результате группы без детей?',
    description: 'Есть таблицы groups и children. Нужно показать все группы, даже если в группе пока нет детей.',
    choices: ['INNER JOIN children', 'LEFT JOIN children', 'CROSS JOIN children', 'JOIN только с WHERE children.id IS NOT NULL'],
    correct: 1, explanation: 'LEFT JOIN сохраняет все строки из левой таблицы.'
  },
  {
    id: 'sql-group', topic: 'SQL', title: 'Как получить число детей в каждой группе?',
    description: 'Группировка идет по идентификатору группы.',
    choices: ['GROUP BY group_id с COUNT(*)', 'ORDER BY group_id с SUM(*)', 'DISTINCT group_id без агрегата', 'WHERE COUNT(*) > 0'],
    correct: 0, explanation: 'GROUP BY собирает строки по группе, COUNT считает строки в каждой группе.'
  },
  {
    id: 'sql-having', topic: 'SQL', title: 'Где отфильтровать группы после подсчета?',
    description: 'Нужны только группы, в которых больше пяти детей.',
    choices: ['WHERE COUNT(*) > 5', 'HAVING COUNT(*) > 5', 'ORDER BY COUNT(*) > 5', 'LIMIT COUNT(*) > 5'],
    correct: 1, explanation: 'HAVING фильтрует агрегированные группы после GROUP BY.'
  },
  {
    id: 'offline-queue', topic: 'Проект', title: 'Что сделать с сообщением без сети?',
    description: 'Пользователь нажал «Отправить», но связи сейчас нет. Какой вариант надежнее?',
    choices: ['Удалить сообщение и попросить написать заново', 'Сохранить локально со статусом ожидания и отправить при появлении связи', 'Бесконечно ждать в открытом окне без сохранения', 'Сразу пометить как доставленное'],
    correct: 1, explanation: 'Локальная очередь позволяет не потерять сообщение и повторить отправку позже.'
  },
  {
    id: 'offline-dedup', topic: 'Проект', title: 'Как не показать одно сообщение дважды?',
    description: 'После восстановления связи клиент повторил отправку, потому что не получил подтверждение.',
    choices: ['Добавить случайную задержку', 'Назначить сообщению постоянный идентификатор и учитывать его при сохранении', 'Сортировать сообщения по тексту', 'Отключить повторную отправку'],
    correct: 1, explanation: 'Постоянный идентификатор помогает распознать повтор одной и той же операции.'
  },
  {
    id: 'practice-java', topic: 'Практика', title: 'Небольшая задача на Java',
    description: 'Есть список Message с полями sender и delivered. Напишите метод или понятный псевдокод, который возвращает количество недоставленных сообщений для каждого отправителя. Учтите пустой список.',
    code: 'record Message(String sender, boolean delivered) {}\n// Результат: Map<String, Integer>',
    kind: 'text', placeholder: 'Напишите метод или псевдокод. Достаточно показать основную идею.'
  },
  {
    id: 'practice-sql', topic: 'Практика', title: 'Небольшая задача на SQL',
    description: 'Есть groups(id, name) и children(id, name, group_id). Напишите запрос, который покажет название каждой группы и количество детей в ней, включая пустые группы.',
    kind: 'text', placeholder: 'SELECT ...'
  }
];
