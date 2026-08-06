import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { currencyList } from './iso4217';

/** Наполнение справочника валют при старте приложения.
 *
 *  Сознательно не в сиде: сид демо-данных на боевом сервере не выполняется
 *  (после `clean:demo` он выходит по флагу demo_cleaned_at), а справочник
 *  валют — не демо-данные, он нужен всегда. Вставка идемпотентна: добавляются
 *  только отсутствующие коды, существующие строки не трогаются, чтобы правка
 *  названия вручную не затиралась при каждом рестарте.
 */
@Injectable()
export class CurrencyService implements OnModuleInit {
  private readonly log = new Logger('Currencies');

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const added = await this.sync();
      if (added > 0) this.log.log(`справочник валют пополнен: +${added}`);
    } catch (e) {
      // Справочник — не повод не подняться: без него работает базовая валюта
      this.log.warn(`не удалось обновить справочник валют: ${(e as Error).message}`);
    }
  }

  /** Возвращает число добавленных валют. */
  async sync(): Promise<number> {
    const rows = currencyList();
    const have = new Set(
      (await this.prisma.currency.findMany({ select: { code: true } })).map((c) => c.code),
    );
    const missing = rows.filter((r) => !have.has(r.code));
    if (missing.length === 0) return 0;
    const res = await this.prisma.currency.createMany({
      data: missing.map((r) => ({ code: r.code, name: r.name })),
      skipDuplicates: true,
    });
    return res.count;
  }
}
