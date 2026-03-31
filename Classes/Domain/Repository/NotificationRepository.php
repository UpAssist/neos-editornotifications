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
                $query->isNotNull('publishedAt'),
                $query->isNull('archivedAt'),
                $query->logicalOr(
                    $query->isNull('showFrom'),
                    $query->lessThanOrEqual('showFrom', $now)
                ),
                $query->logicalOr(
                    $query->isNull('showUntil'),
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
            'draft' => $query->isNull('publishedAt'),
            'archived' => $query->isNotNull('archivedAt'),
            'scheduled' => $query->logicalAnd(
                $query->isNotNull('publishedAt'),
                $query->isNull('archivedAt'),
                $query->greaterThan('showFrom', $now)
            ),
            'expired' => $query->logicalAnd(
                $query->isNotNull('publishedAt'),
                $query->isNull('archivedAt'),
                $query->lessThan('showUntil', $now)
            ),
            'active' => $query->logicalAnd(
                $query->isNotNull('publishedAt'),
                $query->isNull('archivedAt'),
                $query->logicalOr(
                    $query->isNull('showFrom'),
                    $query->lessThanOrEqual('showFrom', $now)
                ),
                $query->logicalOr(
                    $query->isNull('showUntil'),
                    $query->greaterThanOrEqual('showUntil', $now)
                )
            ),
            default => null,
        };
    }
}
