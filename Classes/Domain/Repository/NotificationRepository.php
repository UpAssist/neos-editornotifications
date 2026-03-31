<?php

declare(strict_types=1);

namespace UpAssist\Neos\EditorNotifications\Domain\Repository;

use Neos\Flow\Annotations as Flow;
use Neos\Flow\Persistence\QueryInterface;
use Neos\Flow\Persistence\Repository;
use UpAssist\Neos\EditorNotifications\Domain\Model\Notification;

/**
 * @Flow\Scope("singleton")
 * @method Notification|null findByIdentifier(string $identifier)
 */
class NotificationRepository extends Repository
{
    protected $defaultOrderings = [
        'createdAt' => QueryInterface::ORDER_DESCENDING,
    ];

    /**
     * @return array<int, Notification>
     */
    public function findByFilter(string $filter, int $limit, int $offset): array
    {
        $query = $this->createQuery();
        $query->setOrderings([
            'publishedAt' => QueryInterface::ORDER_DESCENDING,
            'createdAt' => QueryInterface::ORDER_DESCENDING,
        ]);
        $query->setLimit($limit);
        $query->setOffset($offset);

        $constraint = $this->buildFilterConstraint($query, $filter, new \DateTime());
        if ($constraint !== null) {
            $query->matching($constraint);
        }

        return $query->execute()->toArray();
    }

    public function countByFilter(string $filter): int
    {
        $query = $this->createQuery();
        $constraint = $this->buildFilterConstraint($query, $filter, new \DateTime());
        if ($constraint !== null) {
            $query->matching($constraint);
        }

        return $query->count();
    }

    /**
     * @return array<int, Notification>
     */
    public function findActive(): array
    {
        $query = $this->createQuery();
        $now = new \DateTime();
        $query->matching(
            $query->logicalAnd(
                $query->logicalNot($query->equals('publishedAt', null)),
                $query->equals('archivedAt', null),
                $query->logicalOr(
                    $query->equals('showFrom', null),
                    $query->lessThanOrEqual('showFrom', $now)
                ),
                $query->logicalOr(
                    $query->equals('showUntil', null),
                    $query->greaterThanOrEqual('showUntil', $now)
                )
            )
        );
        $query->setOrderings([
            'publishedAt' => QueryInterface::ORDER_DESCENDING,
            'createdAt' => QueryInterface::ORDER_DESCENDING,
        ]);

        return $query->execute()->toArray();
    }

    private function buildFilterConstraint(QueryInterface $query, string $filter, \DateTime $now)
    {
        return match ($filter) {
            'draft' => $query->equals('publishedAt', null),
            'archived' => $query->logicalNot($query->equals('archivedAt', null)),
            'scheduled' => $query->logicalAnd(
                $query->logicalNot($query->equals('publishedAt', null)),
                $query->equals('archivedAt', null),
                $query->greaterThan('showFrom', $now)
            ),
            'expired' => $query->logicalAnd(
                $query->logicalNot($query->equals('publishedAt', null)),
                $query->equals('archivedAt', null),
                $query->lessThan('showUntil', $now)
            ),
            'active' => $query->logicalAnd(
                $query->logicalNot($query->equals('publishedAt', null)),
                $query->equals('archivedAt', null),
                $query->logicalOr(
                    $query->equals('showFrom', null),
                    $query->lessThanOrEqual('showFrom', $now)
                ),
                $query->logicalOr(
                    $query->equals('showUntil', null),
                    $query->greaterThanOrEqual('showUntil', $now)
                )
            ),
            default => null,
        };
    }
}
